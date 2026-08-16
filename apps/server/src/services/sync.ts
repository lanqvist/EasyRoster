import type { SyncStatus, EquipmentRow } from "@easyroster/core";
import type { ConfigService } from "./config.js";
import type { Db } from "./db.js";
import { BlizzardApiError, BlizzardClient, type EquippedItem } from "./blizzard.js";
import { CharactersRepo } from "./characters-repo.js";

/**
 * Синхронизация с Blizzard API:
 *  - syncGuild(): ростер гильдии → таблица characters (флаг is_raider по config.raiderRanks);
 *  - syncCharacters(): для рейдеров /status → summary (If-Modified-Since) → equipment → specializations → media.
 * Один прогон за раз; прогресс доступен через status().
 */
export class SyncService {
  private running: SyncStatus["kind"] = null;
  private progress: SyncStatus["progress"] = null;
  private lastGuildSync: SyncStatus["lastGuildSync"] = null;
  private lastCharSync: SyncStatus["lastCharSync"] = null;
  private timer: NodeJS.Timeout | null = null;
  private nextAutoSyncAt: number | null = null;
  readonly repo: CharactersRepo;
  /** Хук после синка персонажей (например, дозагрузка предметов экипировки в справочник). */
  afterCharacterSync: (() => Promise<void>) | null = null;
  /** Периодические задачи (вызываются планировщиком после автосинка). */
  periodicTasks: (() => Promise<void>) | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: Db,
    private readonly log: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
  ) {
    this.repo = new CharactersRepo(db);
    this.restoreLastRuns();
  }

  private restoreLastRuns(): void {
    const q = this.db.conn.prepare(
      "SELECT kind, finished_at, ok, message FROM sync_log WHERE kind = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1",
    );
    const g = q.get("guild") as any;
    const c = q.get("characters") as any;
    if (g) this.lastGuildSync = { at: g.finished_at, ok: !!g.ok, message: g.message ?? "" };
    if (c) this.lastCharSync = { at: c.finished_at, ok: !!c.ok, message: c.message ?? "" };
  }

  status(): SyncStatus {
    return {
      running: this.running !== null,
      kind: this.running,
      progress: this.progress,
      lastGuildSync: this.lastGuildSync,
      lastCharSync: this.lastCharSync,
      nextAutoSyncAt: this.nextAutoSyncAt,
    };
  }

  private client(): BlizzardClient {
    const cfg = this.config.get();
    return new BlizzardClient(cfg.blizzard, cfg.region, cfg.locale);
  }

  private logStart(kind: string): number {
    const r = this.db.conn.prepare("INSERT INTO sync_log(kind, started_at) VALUES (?, ?)").run(kind, Date.now());
    return Number(r.lastInsertRowid);
  }

  private logFinish(id: number, ok: boolean, message: string): void {
    this.db.conn.prepare("UPDATE sync_log SET finished_at = ?, ok = ?, message = ? WHERE id = ?").run(Date.now(), ok ? 1 : 0, message, id);
  }

  // ---------------------------------------------------------------- guild

  async syncGuild(): Promise<{ added: number; updated: number; left: number; raiders: number }> {
    if (this.running) throw new Error("Синхронизация уже выполняется");
    this.running = "guild";
    this.progress = { done: 0, total: 1, current: "ростер гильдии" };
    const logId = this.logStart("guild");
    try {
      const cfg = this.config.get();
      if (!cfg.guild.realmSlug || !cfg.guild.nameSlug) throw new Error("Гильдия не настроена");
      const client = this.client();
      const roster = await client.guildRoster(cfg.guild.realmSlug, cfg.guild.nameSlug);
      const raiderRanks = new Set(cfg.raiderRanks);
      const now = Date.now();
      const members = roster.members.map((m) => ({
        id: m.character.id,
        name: m.character.name,
        realmSlug: m.character.realm.slug,
        realmName: m.character.realm.name ?? "",
        classId: m.character.playable_class.id,
        level: m.character.level,
        faction: m.character.faction?.type ?? null,
        rank: m.rank,
        isRaider: raiderRanks.has(m.rank),
      }));
      const res = this.repo.upsertRoster(members, now);
      const raiders = members.filter((m) => m.isRaider).length;
      const msg = `Ростер: ${members.length} персонажей, рейдеров ${raiders} (+${res.added}, обновлено ${res.updated}, покинули ${res.left})`;
      this.logFinish(logId, true, msg);
      this.lastGuildSync = { at: Date.now(), ok: true, message: msg };
      this.log.info(msg);
      return { ...res, raiders };
    } catch (e) {
      const msg = (e as Error).message;
      this.logFinish(logId, false, msg);
      this.lastGuildSync = { at: Date.now(), ok: false, message: msg };
      this.log.error(`syncGuild: ${msg}`);
      throw e;
    } finally {
      this.running = null;
      this.progress = null;
    }
  }

  // ----------------------------------------------------------- characters

  async syncCharacters(opts: { ids?: number[]; force?: boolean } = {}): Promise<{ ok: number; unchanged: number; nodata: number; errors: number }> {
    if (this.running) throw new Error("Синхронизация уже выполняется");
    this.running = "characters";
    const logId = this.logStart("characters");
    const counters = { ok: 0, unchanged: 0, nodata: 0, errors: 0 };
    try {
      const client = this.client();
      let chars = this.repo.listRaiders();
      if (opts.ids && opts.ids.length > 0) {
        const set = new Set(opts.ids);
        chars = this.repo.list({ onlyRaiders: false }).filter((c) => set.has(c.id));
      }
      this.progress = { done: 0, total: chars.length };

      const CONCURRENCY = 4;
      let idx = 0;
      const worker = async () => {
        while (idx < chars.length) {
          const ch = chars[idx++]!;
          this.progress = { done: idx - 1, total: chars.length, current: `${ch.name}-${ch.realmName || ch.realmSlug}` };
          try {
            const r = await this.syncOne(client, ch.id, ch.realmSlug, ch.name, opts.force ?? false);
            counters[r]++;
          } catch (e) {
            counters.errors++;
            const msg = e instanceof BlizzardApiError ? `HTTP ${e.status}` : (e as Error).message;
            this.repo.setProfileStatus(ch.id, "error", msg);
            this.log.warn(`sync ${ch.name}: ${msg}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chars.length) }, worker));
      this.progress = { done: chars.length, total: chars.length };
      const msg = `Персонажи: обновлено ${counters.ok}, без изменений ${counters.unchanged}, нет данных ${counters.nodata}, ошибок ${counters.errors}`;
      this.logFinish(logId, counters.errors === 0, msg);
      this.lastCharSync = { at: Date.now(), ok: counters.errors === 0, message: msg };
      this.log.info(msg);
      if (this.afterCharacterSync) await this.afterCharacterSync().catch((e) => this.log.warn(`afterCharacterSync: ${(e as Error).message}`));
      return counters;
    } catch (e) {
      const msg = (e as Error).message;
      this.logFinish(logId, false, msg);
      this.lastCharSync = { at: Date.now(), ok: false, message: msg };
      throw e;
    } finally {
      this.running = null;
      this.progress = null;
    }
  }

  private async syncOne(
    client: BlizzardClient,
    id: number,
    realmSlug: string,
    name: string,
    force: boolean,
  ): Promise<"ok" | "unchanged" | "nodata"> {
    const status = await client.characterStatus(realmSlug, name);
    if (!status) {
      this.repo.setProfileStatus(id, "nodata", "Профиль недоступен (давно не заходил или ещё не прогружен)");
      return "nodata";
    }
    if (!status.is_valid || status.id !== id) {
      this.repo.setProfileStatus(id, "invalid", status.id !== id ? "Персонаж переименован/пересоздан (id не совпадает)" : "Профиль невалиден");
      return "nodata";
    }

    const prev = this.repo.get(id);
    const ifModifiedSince = force ? undefined : (prev?.summaryLastModified ?? undefined);
    const summaryRes = await client.characterSummary(realmSlug, name, ifModifiedSince);
    if (summaryRes.status === 304) {
      this.repo.touchProfile(id, Date.now());
      return "unchanged";
    }
    const summary = summaryRes.data!;

    const [equipment, specs, media] = await Promise.all([
      client.characterEquipment(realmSlug, name).catch(() => null),
      client.characterSpecializations(realmSlug, name).catch(() => null),
      client.characterMedia(realmSlug, name).catch(() => null),
    ]);

    const activeSpecId = summary.active_spec?.id ?? specs?.active_specialization?.id ?? null;
    let loadout: string | null = null;
    if (specs?.specializations) {
      for (const s of specs.specializations) {
        if (s.specialization.id !== activeSpecId) continue;
        loadout = s.loadouts?.find((l) => l.is_active)?.talent_loadout_code ?? null;
      }
    }
    const avatar = media?.assets?.find((a) => a.key === "avatar")?.value ?? null;

    this.repo.saveProfile(
      id,
      {
        activeSpecId,
        ilvlEquipped: summary.equipped_item_level,
        ilvlAvg: summary.average_item_level,
        lastLoginMs: summary.last_login_timestamp,
        realmName: summary.realm.name,
        level: summary.level,
        avatarUrl: avatar,
        talentLoadoutCode: loadout,
        summaryLastModified: summaryRes.lastModified ?? null,
        syncedAt: Date.now(),
      },
      (equipment?.equipped_items ?? []).map(mapEquipped),
    );
    return "ok";
  }

  // ------------------------------------------------------------ scheduler

  startScheduler(): void {
    this.stopScheduler();
    const minutes = this.config.get().sync.intervalMinutes;
    if (!minutes) {
      this.nextAutoSyncAt = null;
      return;
    }
    const ms = minutes * 60_000;
    this.nextAutoSyncAt = Date.now() + ms;
    this.timer = setInterval(() => {
      this.nextAutoSyncAt = Date.now() + ms;
      if (this.running) return;
      const cfg = this.config.get();
      if (!cfg.setupComplete || !cfg.blizzard.clientSecret) return;
      this.syncGuild()
        .then(() => this.syncCharacters())
        .then(() => this.periodicTasks?.())
        .catch((e) => this.log.warn(`автосинк: ${(e as Error).message}`));
    }, ms);
    this.timer.unref();
  }

  stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.nextAutoSyncAt = null;
  }
}

function mapEquipped(it: EquippedItem): Omit<EquipmentRow, "characterId"> {
  const gems = (it.sockets ?? []).filter((s) => s.item).map((s) => ({ itemId: s.item!.id, name: s.item!.name }));
  const emptySockets = (it.sockets ?? []).filter((s) => !s.item).length;
  const enchant = (it.enchantments ?? []).find((e) => e.enchantment_slot?.type === "PERMANENT") ?? it.enchantments?.[0];
  return {
    slot: it.slot.type,
    itemId: it.item.id,
    itemName: it.name ?? null,
    ilvl: it.level?.value ?? null,
    quality: it.quality?.type ?? null,
    invType: it.inventory_type?.type ?? null,
    bonusIds: it.bonus_list ?? [],
    context: it.context ?? null,
    trackName: it.name_description?.display_string ?? null,
    enchantId: enchant?.enchantment_id ?? null,
    gems,
    emptySockets,
    setId: it.set?.item_set.id ?? null,
    setName: it.set?.item_set.name ?? null,
  };
}
