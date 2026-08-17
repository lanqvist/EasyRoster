import fs from "node:fs";
import path from "node:path";
import { INVENTORY_TYPE_TO_SLOT, type BonusEntry, type ItemRow, type InstanceRow, type StaticDataStatus } from "@easyroster/core";
import { CACHE_DIR } from "../paths.js";
import type { Db } from "./db.js";
import type { ConfigService } from "./config.js";

/**
 * Статические данные Raidbots (публичные JSON):
 *   metadata.json, encounter-items.json, instances.json, bonuses.json, item-conversions.json
 * Скачиваются в data/cache/raidbots/, разбираются в SQLite (items, item_sources, instances);
 * bonuses держим в памяти (Map) — нужны для декодирования треков.
 */
const BASE = process.env.EASYROSTER_RAIDBOTS_BASE ?? "https://www.raidbots.com/static/data/live";
const FILES = ["metadata.json", "encounter-items.json", "instances.json", "bonuses.json", "item-conversions.json"] as const;

interface RaidbotsItem {
  id: number;
  name: string;
  icon?: string;
  quality?: number;
  itemClass?: number;
  itemSubClass?: number;
  inventoryType?: number;
  itemLevel?: number;
  itemSetId?: number;
  specs?: number[];
  allowableClasses?: number[];
  stats?: Array<{ id: number; alloc: number }>;
  contains?: number[];
  uniqueEquipped?: boolean;
  onUseTrinket?: boolean;
  expansion?: number;
  sources?: Array<{ instanceId: number; encounterId: number }>;
}

interface RaidbotsInstance {
  id: number;
  name: string;
  type: string;
  order?: number;
  encounters: Array<{ id: number; name: string }>;
}

export class StaticDataService {
  private bonuses: Map<number, BonusEntry> = new Map();
  /** catalyst: conversionId → { items[] , … } */
  private conversions: Record<string, { id: number; items: RaidbotsItem[] }> = {};
  private refreshing = false;
  private lastError: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: ConfigService,
    private readonly log: { info: (m: string) => void; warn: (m: string) => void },
  ) {
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadBonusesFromCache();
  }

  private get dir(): string {
    return path.join(CACHE_DIR, "raidbots");
  }

  status(): StaticDataStatus {
    const count = (sql: string) => (this.db.conn.prepare(sql).get() as { n: number }).n;
    return {
      build: this.db.getMeta("static.build") ?? null,
      updatedAt: Number(this.db.getMeta("static.updatedAt") ?? 0) || null,
      items: count("SELECT COUNT(*) n FROM items"),
      instances: count("SELECT COUNT(*) n FROM instances"),
      bonuses: this.bonuses.size,
      refreshing: this.refreshing,
      lastError: this.lastError,
      season: this.seasonInfo(),
    };
  }

  getBonuses(): ReadonlyMap<number, BonusEntry> {
    return this.bonuses;
  }

  private loadBonusesFromCache(): void {
    const p = path.join(this.dir, "bonuses.json");
    if (!fs.existsSync(p)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, BonusEntry>;
      this.bonuses = new Map(Object.values(raw).map((b) => [b.id, b]));
    } catch (e) {
      this.log.warn(`bonuses.json повреждён: ${(e as Error).message}`);
    }
    const c = path.join(this.dir, "item-conversions.json");
    if (fs.existsSync(c)) {
      try {
        this.conversions = JSON.parse(fs.readFileSync(c, "utf8"));
      } catch {
        /* ignore */
      }
    }
  }

  /** Скачать (если изменился build) и разобрать. force — перекачать всегда. */
  async refresh(force = false): Promise<{ build: string; items: number; instances: number; skipped: boolean }> {
    if (this.refreshing) throw new Error("Обновление справочников уже идёт");
    this.refreshing = true;
    this.lastError = null;
    try {
      const meta = (await this.fetchJson("metadata.json")) as { wowBuild?: string; contentHash?: string; generatedAt?: string };
      const build = String(meta.wowBuild ?? meta.contentHash ?? "unknown");
      const prev = this.db.getMeta("static.build");
      const haveAll = FILES.every((f) => fs.existsSync(path.join(this.dir, f)));
      if (!force && prev === build && haveAll && this.status().items > 0) {
        return { build, items: this.status().items, instances: this.status().instances, skipped: true };
      }
      for (const f of FILES) {
        const data = await this.fetchText(f);
        fs.writeFileSync(path.join(this.dir, f), data, "utf8");
      }
      this.loadBonusesFromCache();
      const items = JSON.parse(fs.readFileSync(path.join(this.dir, "encounter-items.json"), "utf8")) as RaidbotsItem[];
      const instances = JSON.parse(fs.readFileSync(path.join(this.dir, "instances.json"), "utf8")) as RaidbotsInstance[];
      this.importInstances(instances);
      this.importItems(items);
      this.db.setMeta("static.build", build);
      this.db.setMeta("static.updatedAt", String(Date.now()));
      this.autoDetectSeason(instances);
      const msg = `Raidbots ${build}: предметов ${items.length}, инстансов ${instances.length}, бонусов ${this.bonuses.size}`;
      this.log.info(msg);
      return { build, items: items.length, instances: instances.length, skipped: false };
    } catch (e) {
      this.lastError = (e as Error).message;
      throw e;
    } finally {
      this.refreshing = false;
    }
  }

  private async fetchText(file: string): Promise<string> {
    const res = await fetch(`${BASE}/${file}`, { headers: { "User-Agent": "EasyRoster/0.1 (local guild tool)" } });
    if (!res.ok) throw new Error(`Raidbots ${file}: HTTP ${res.status}`);
    return res.text();
  }
  private async fetchJson(file: string): Promise<unknown> {
    return JSON.parse(await this.fetchText(file));
  }

  private importInstances(list: RaidbotsInstance[]): void {
    const c = this.db.conn;
    const ins = c.prepare("INSERT OR REPLACE INTO instances(id, name, type, sort_order, encounters) VALUES (?, ?, ?, ?, ?)");
    c.exec("BEGIN");
    try {
      for (const i of list) {
        ins.run(i.id, i.name, i.type, i.order ?? null, JSON.stringify(i.encounters.map((e) => ({ id: e.id, name: e.name }))));
      }
      c.exec("COMMIT");
    } catch (e) {
      c.exec("ROLLBACK");
      throw e;
    }
  }

  private importItems(list: RaidbotsItem[]): void {
    const c = this.db.conn;
    const ins = c.prepare(`
      INSERT INTO items(id, name, icon, quality, item_class, item_subclass, inventory_type, slot, base_ilvl, item_set_id, specs,
        allowable_classes, stats, contains, unique_equipped, on_use_trinket, expansion, origin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'raidbots')
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, quality = excluded.quality,
        item_class = excluded.item_class, item_subclass = excluded.item_subclass, inventory_type = excluded.inventory_type,
        slot = excluded.slot, base_ilvl = excluded.base_ilvl, item_set_id = excluded.item_set_id, specs = excluded.specs,
        allowable_classes = excluded.allowable_classes, stats = excluded.stats, contains = excluded.contains,
        unique_equipped = excluded.unique_equipped, on_use_trinket = excluded.on_use_trinket, expansion = excluded.expansion,
        origin = 'raidbots'
    `);
    const delSrc = c.prepare("DELETE FROM item_sources WHERE item_id = ?");
    const insSrc = c.prepare("INSERT OR IGNORE INTO item_sources(item_id, instance_id, encounter_id) VALUES (?, ?, ?)");
    c.exec("BEGIN");
    try {
      for (const it of list) {
        ins.run(
          it.id, it.name, it.icon ?? null, it.quality ?? null, it.itemClass ?? null, it.itemSubClass ?? null,
          it.inventoryType ?? null, it.inventoryType != null ? INVENTORY_TYPE_TO_SLOT[it.inventoryType] ?? null : null,
          it.itemLevel ?? null, it.itemSetId ?? null, it.specs ? JSON.stringify(it.specs) : null,
          it.allowableClasses ? JSON.stringify(it.allowableClasses) : null, JSON.stringify(it.stats ?? []),
          it.contains ? JSON.stringify(it.contains) : null, it.uniqueEquipped ? 1 : 0, it.onUseTrinket ? 1 : 0, it.expansion ?? null,
        );
        delSrc.run(it.id);
        for (const s of it.sources ?? []) insSrc.run(it.id, s.instanceId, s.encounterId);
      }
      c.exec("COMMIT");
    } catch (e) {
      c.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * Автоопределение сезона: последняя группа "Season N Raids" (id < 0, type raid) → рейды сезона;
   * группа "Mythic+ Dungeons" (id -1) → подземелья; seasonId — самый большой upgrade.seasonId в bonuses.
   */
  private autoDetectSeason(instances: RaidbotsInstance[]): void {
    const cfg = this.config.get();
    if (cfg.season.raidInstanceIds.length > 0 && cfg.season.dungeonInstanceIds.length > 0 && cfg.season.seasonId) return;

    const seasonGroups = instances
      .filter((i) => i.id < 0 && i.type === "raid" && /season\s+(\d+)/i.test(i.name))
      .map((i) => ({ i, n: Number(/season\s+(\d+)/i.exec(i.name)![1]) }))
      .sort((a, b) => b.n - a.n);
    const raidGroup = seasonGroups[0]?.i;
    let raidIds: number[] = [];
    if (raidGroup) {
      const encIds = new Set(raidGroup.encounters.map((e) => e.id));
      raidIds = instances.filter((i) => i.id > 0 && i.type === "raid" && i.encounters.some((e) => encIds.has(e.id))).map((i) => i.id);
    }
    const mplus = instances.find((i) => i.id === -1 || i.type === "mplus-chest");
    const dungeonIds = mplus ? mplus.encounters.map((e) => e.id) : [];
    let seasonId: number | null = null;
    for (const b of this.bonuses.values()) if (b.upgrade?.seasonId && (seasonId === null || b.upgrade.seasonId > seasonId)) seasonId = b.upgrade.seasonId;

    this.config.update({
      season: {
        raidInstanceIds: cfg.season.raidInstanceIds.length ? cfg.season.raidInstanceIds : raidIds,
        dungeonInstanceIds: cfg.season.dungeonInstanceIds.length ? cfg.season.dungeonInstanceIds : dungeonIds,
        seasonId: cfg.season.seasonId ?? seasonId,
        label: cfg.season.label || (raidGroup ? raidGroup.name.replace(/\s*Raids?$/i, "") : ""),
      },
    });
  }

  seasonInfo(): StaticDataStatus["season"] {
    const s = this.config.get().season;
    const byId = (ids: number[]) => ids.map((id) => this.instance(id)).filter((x): x is InstanceRow => !!x);
    return { label: s.label, seasonId: s.seasonId, raids: byId(s.raidInstanceIds), dungeons: byId(s.dungeonInstanceIds) };
  }

  // ------------------------------------------------------------ queries

  /** Показывать русские названия (locale ru_RU) — применяется ко всем выдачам инстансов/боссов. */
  private get ru(): boolean {
    return this.config.get().locale === "ru_RU";
  }

  /** Перевод служебных групп Raidbots (у них нет id в журнале Blizzard). */
  private pseudoRu(name: string): string {
    return name
      .replace(/^Catalyst( - Midnight)? Season (\d+)$/i, "Катализатор (сезон $2)")
      .replace(/^Catalyst Season (\d+)$/i, "Катализатор (сезон $1)")
      .replace(/^Normal Dungeons$/i, "Подземелья")
      .replace(/^Mythic\+ Dungeons$/i, "Ключи M+")
      .replace(/^Season (\d+) Raids$/i, "Рейды сезона $1")
      .replace(/^Trash Drop$/i, "Треш")
      .replace(/^Delves Season (\d+)$/i, "Вылазки (сезон $1)")
      .replace(/^Prey Season (\d+)$/i, "Добыча (сезон $1)")
      .replace(/^PVP Season (\d+) \((Honor|Conquest|Bloody Tokens)\)$/i, "PvP сезон $1 ($2)")
      .replace(/^World Bosses?$/i, "Мировые боссы")
      .replace(/^Crafted$/i, "Крафт")
      .replace(/^Great Vault$/i, "Великий тайник");
  }

  private mapInstance(r: any): InstanceRow {
    const encs = JSON.parse(r.encounters) as Array<{ id: number; name: string }>;
    const encRu: Record<string, string> = r.encounters_ru ? JSON.parse(r.encounters_ru) : {};
    const ru = this.ru;
    return {
      id: r.id,
      name: ru ? (r.name_ru ?? this.pseudoRu(r.name)) : r.name,
      nameEn: r.name,
      type: r.type,
      order: r.sort_order,
      encounters: encs.map((e) => ({ id: e.id, name: ru ? (encRu[String(e.id)] ?? this.pseudoRu(e.name)) : e.name, nameEn: e.name })),
    };
  }

  instance(id: number): InstanceRow | undefined {
    const r = this.db.conn.prepare("SELECT * FROM instances WHERE id = ?").get(id) as any;
    return r ? this.mapInstance(r) : undefined;
  }

  /** Инстансы без русских названий (для локализации через Blizzard). */
  instancesWithoutRu(ids: number[]): Array<{ id: number; encounters: number[] }> {
    const out: Array<{ id: number; encounters: number[] }> = [];
    for (const id of ids) {
      const r = this.db.conn.prepare("SELECT id, name_ru, encounters, encounters_ru FROM instances WHERE id = ?").get(id) as any;
      if (!r) continue;
      const encs = (JSON.parse(r.encounters) as Array<{ id: number }>).map((e) => e.id).filter((e) => e > 0);
      const have: Record<string, string> = r.encounters_ru ? JSON.parse(r.encounters_ru) : {};
      const missing = encs.filter((e) => !have[String(e)]);
      if (!r.name_ru || missing.length) out.push({ id, encounters: missing });
    }
    return out;
  }

  setInstanceRu(id: number, nameRu: string | null, encountersRu: Record<string, string>): void {
    const r = this.db.conn.prepare("SELECT encounters_ru FROM instances WHERE id = ?").get(id) as any;
    const merged = { ...(r?.encounters_ru ? JSON.parse(r.encounters_ru) : {}), ...encountersRu };
    this.db.conn.prepare("UPDATE instances SET name_ru = COALESCE(?, name_ru), encounters_ru = ? WHERE id = ?").run(nameRu, JSON.stringify(merged), id);
  }

  listInstances(): InstanceRow[] {
    return (this.db.conn.prepare("SELECT * FROM instances ORDER BY sort_order, id").all() as any[]).map((r) => this.mapInstance(r));
  }

  item(id: number): ItemRow | undefined {
    const r = this.db.conn.prepare("SELECT * FROM items WHERE id = ?").get(id);
    return r ? mapItem(r) : undefined;
  }

  items(ids: number[]): Map<number, ItemRow> {
    const out = new Map<number, ItemRow>();
    if (ids.length === 0) return out;
    const q = this.db.conn.prepare("SELECT * FROM items WHERE id = ?");
    for (const id of new Set(ids)) {
      const r = q.get(id);
      if (r) out.set(id, mapItem(r));
    }
    return out;
  }

  /** Все предметы инстанса с encounterId (по item_sources). */
  instanceLoot(instanceId: number): Array<ItemRow & { encounterId: number }> {
    const rows = this.db.conn
      .prepare("SELECT i.*, s.encounter_id AS encounter_id FROM item_sources s JOIN items i ON i.id = s.item_id WHERE s.instance_id = ? ORDER BY s.encounter_id, i.slot, i.name")
      .all(instanceId) as any[];
    return rows.map((r) => ({ ...mapItem(r), encounterId: r.encounter_id }));
  }

  /** Источники предмета (для UI «откуда падает»). */
  itemSources(itemId: number): Array<{ instanceId: number; encounterId: number; instanceName: string; encounterName: string }> {
    const rows = this.db.conn
      .prepare("SELECT s.instance_id, s.encounter_id, i.name AS iname, i.name_ru AS iname_ru, i.encounters, i.encounters_ru FROM item_sources s LEFT JOIN instances i ON i.id = s.instance_id WHERE s.item_id = ?")
      .all(itemId) as any[];
    const ru = this.ru;
    return rows.map((r) => {
      const encs = r.encounters ? (JSON.parse(r.encounters) as Array<{ id: number; name: string }>) : [];
      const encRu: Record<string, string> = r.encounters_ru ? JSON.parse(r.encounters_ru) : {};
      const encEn = encs.find((e) => e.id === r.encounter_id)?.name;
      // для M+ группы (-1) encounterId = id подземелья → берём его русское имя из таблицы инстансов
      let encName = ru && encRu[String(r.encounter_id)] ? encRu[String(r.encounter_id)]! : encEn;
      if (!encName || (ru && !encRu[String(r.encounter_id)] && r.encounter_id > 0 && r.instance_id < 0)) {
        const inner = this.db.conn.prepare("SELECT name, name_ru FROM instances WHERE id = ?").get(r.encounter_id) as any;
        if (inner) encName = ru && inner.name_ru ? inner.name_ru : (encName ?? inner.name);
      }
      return {
        instanceId: r.instance_id,
        encounterId: r.encounter_id,
        instanceName: ru ? (r.iname_ru ?? (r.iname ? this.pseudoRu(r.iname) : `#${r.instance_id}`)) : (r.iname ?? `#${r.instance_id}`),
        encounterName: encName ? (ru ? this.pseudoRu(encName) : encName) : `#${r.encounter_id}`,
      };
    });
  }

  /** Тир-токен → предметы, которые он содержит; предмет тира → сет. */
  tokenContains(itemId: number): number[] {
    return this.item(itemId)?.contains ?? [];
  }

  /** Обновить локализованные имена (из Blizzard API). */
  setNamesRu(entries: Array<{ id: number; nameRu: string }>): void {
    const upd = this.db.conn.prepare("UPDATE items SET name_ru = ? WHERE id = ?");
    this.db.conn.exec("BEGIN");
    for (const e of entries) upd.run(e.nameRu, e.id);
    this.db.conn.exec("COMMIT");
  }

  /** Добавить предмет из Blizzard API (для экипировки вне лут-таблиц). */
  upsertBlizzardItem(it: {
    id: number; name: string; nameRu?: string | null; icon?: string | null; quality?: number | null; itemClass?: number | null;
    itemSubClass?: number | null; inventoryType?: number | null; baseIlvl?: number | null; itemSetId?: number | null;
  }): void {
    this.db.conn
      .prepare(`
        INSERT INTO items(id, name, name_ru, icon, quality, item_class, item_subclass, inventory_type, slot, base_ilvl, item_set_id, stats, origin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'blizzard')
        ON CONFLICT(id) DO UPDATE SET name_ru = COALESCE(excluded.name_ru, items.name_ru), icon = COALESCE(items.icon, excluded.icon)
      `)
      .run(
        it.id, it.name, it.nameRu ?? null, it.icon ?? null, it.quality ?? null, it.itemClass ?? null, it.itemSubClass ?? null,
        it.inventoryType ?? null, it.inventoryType != null ? INVENTORY_TYPE_TO_SLOT[it.inventoryType] ?? null : null,
        it.baseIlvl ?? null, it.itemSetId ?? null,
      );
  }

  /** Из набора id — те, что есть в справочнике, но без name_ru. */
  itemsWithoutRu(ids: number[]): number[] {
    const q = this.db.conn.prepare("SELECT name_ru FROM items WHERE id = ?");
    return [...new Set(ids)].filter((id) => {
      const r = q.get(id) as any;
      return r && !r.name_ru;
    });
  }

  getIconUrl(id: number): string | null {
    const r = this.db.conn.prepare("SELECT icon_url FROM items WHERE id = ?").get(id) as any;
    return r?.icon_url ?? null;
  }
  setIconUrl(id: number, url: string): void {
    this.db.conn.prepare("UPDATE items SET icon_url = ? WHERE id = ?").run(url, id);
  }

  missingItemIds(ids: number[]): number[] {
    const q = this.db.conn.prepare("SELECT 1 FROM items WHERE id = ?");
    return [...new Set(ids)].filter((id) => !q.get(id));
  }

  /** id предметов инстансов сезона без name_ru. */
  seasonItemsWithoutRu(): number[] {
    const s = this.config.get().season;
    const ids = [...s.raidInstanceIds, ...s.dungeonInstanceIds];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    return (
      this.db.conn
        .prepare(`SELECT DISTINCT i.id FROM items i JOIN item_sources s ON s.item_id = i.id WHERE s.instance_id IN (${placeholders}) AND i.name_ru IS NULL`)
        .all(...ids) as Array<{ id: number }>
    ).map((r) => r.id);
  }
}

export function mapItem(r: any): ItemRow {
  return {
    id: r.id,
    name: r.name,
    nameRu: r.name_ru,
    icon: r.icon,
    quality: r.quality,
    itemClass: r.item_class,
    itemSubClass: r.item_subclass,
    inventoryType: r.inventory_type,
    slot: r.slot,
    baseIlvl: r.base_ilvl,
    itemSetId: r.item_set_id,
    specs: r.specs ? JSON.parse(r.specs) : null,
    allowableClasses: r.allowable_classes ? JSON.parse(r.allowable_classes) : null,
    stats: r.stats ? JSON.parse(r.stats) : [],
    contains: r.contains ? JSON.parse(r.contains) : null,
    uniqueEquipped: !!r.unique_equipped,
    onUseTrinket: !!r.on_use_trinket,
    expansion: r.expansion,
    origin: r.origin,
  };
}
