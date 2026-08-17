import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { SPEC_BY_ID, type CharacterRow, type ItemRow, type ParsedCandidate, type SimCandidateMeta, type SimStatus, type SimCharacterState } from "@easyroster/core";
import { CACHE_DIR } from "../../paths.js";
import type { ConfigService } from "../config.js";
import type { Db } from "../db.js";
import type { StaticDataService } from "../static-data.js";
import type { CharactersRepo } from "../characters-repo.js";
import type { BisRepo } from "../bis/repo.js";
import type { Logger } from "../../context.js";
import { SimcRunner } from "./simc-runner.js";
import { buildSimcProfile, defaultTalentsFromProfiles } from "./profile.js";
import { buildSimCandidates, profilesetLine, trackBonusIds, type SimCandidate } from "./candidates.js";

/**
 * Автосим: очередь персонажей → simc profilesets по луту сезона → bis_candidates(source='simc').
 * Один сим за раз (simc сам использует все ядра).
 */
export class SimService {
  readonly runner: SimcRunner;
  private queue: number[] = [];
  private current: { characterId: number; name: string; stage: string; startedAt: number } | null = null;
  private working = false;
  /** после каждого успешного сима (например, экспорт db.lua) */
  afterSim: ((characterId: number) => Promise<void>) | null = null;
  /** сколько частей тира надето (устанавливается контекстом из TierService) */
  tierPiecesOf: ((c: CharacterRow) => number) | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: ConfigService,
    private readonly staticData: StaticDataService,
    private readonly chars: CharactersRepo,
    private readonly bisRepo: BisRepo,
    private readonly log: Logger,
  ) {
    this.runner = new SimcRunner(log);
  }

  // ------------------------------------------------------------ статус

  status(): SimStatus {
    const cfg = this.config.get().sim;
    const info = this.runner.locate(cfg.simcPath);
    return {
      enabled: cfg.enabled,
      simcPath: info.path,
      simcVersion: info.version,
      installing: this.runner.installing,
      installMessage: this.runner.installMessage,
      running: this.working,
      current: this.current,
      queue: this.queue.length,
      cpuThreads: os.cpus().length,
      characters: this.characterStates(),
    };
  }

  characterStates(): SimCharacterState[] {
    const cfg = this.config.get().sim;
    const rows = this.db.conn
      .prepare(
        `SELECT r.* FROM sim_runs r JOIN (SELECT character_id, MAX(id) mid FROM sim_runs GROUP BY character_id) m ON m.mid = r.id`,
      )
      .all() as any[];
    const byChar = new Map<number, any>(rows.map((r) => [r.character_id, r]));
    const out: SimCharacterState[] = [];
    for (const c of this.chars.listRaiders()) {
      const r = byChar.get(c.id);
      const role = c.activeSpecId ? SPEC_BY_ID.get(c.activeSpecId)?.role ?? null : null;
      const supported = role === "DAMAGER" || role === "TANK";
      const stale = r?.ok && r.finished_at ? Date.now() - r.finished_at > cfg.maxAgeDays * 86400000 : true;
      const hashNow = this.equipmentHash(c);
      out.push({
        characterId: c.id,
        name: c.name,
        supported,
        reason: supported ? null : role === "HEALER" ? "хилы: SimC не симулирует лечение" : "нет спеки/экипировки",
        lastRunAt: r?.finished_at ?? null,
        lastOk: r?.finished_at ? !!r.ok : null,
        lastMessage: r?.message ?? null,
        profilesets: r?.profilesets ?? null,
        baseline: r?.baseline ?? null,
        elapsedMs: r?.elapsed_ms ?? null,
        stale,
        equipmentChanged: !!r && r.equipment_hash !== hashNow,
        queued: this.queue.includes(c.id) || this.current?.characterId === c.id,
      });
    }
    return out;
  }

  private equipmentHash(c: CharacterRow): string {
    const cfg = this.config.get().sim;
    const eq = this.chars.equipment(c.id).map((e) => [e.slot, e.itemId, e.bonusIds.join("/"), e.enchantId, e.gems.map((g) => g.itemId).join("/")]);
    const payload = JSON.stringify({ eq, spec: c.activeSpecId, talents: c.talentsOverride ?? (cfg.talentsSource === "simc-profile" ? "profile" : c.talentLoadoutCode), fs: cfg.fightStyle, rt: cfg.raidTracks, dt: cfg.dungeonTracks, te: cfg.targetError });
    return crypto.createHash("sha1").update(payload).digest("hex");
  }

  // ------------------------------------------------------------ очередь

  /** Поставить в очередь; onlyStale — только тех, у кого нет свежего сима / сменилась экипировка. */
  enqueue(ids: number[] | "all", onlyStale = false): number {
    const states = this.characterStates();
    const wanted = ids === "all" ? states.map((s) => s.characterId) : ids;
    let added = 0;
    for (const id of wanted) {
      const st = states.find((s) => s.characterId === id);
      if (!st || !st.supported) continue;
      if (onlyStale && !st.stale && !st.equipmentChanged) continue;
      if (this.queue.includes(id) || this.current?.characterId === id) continue;
      this.queue.push(id);
      added++;
    }
    if (added) void this.work();
    return added;
  }

  clearQueue(): void {
    this.queue = [];
  }

  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        const c = this.chars.get(id);
        if (!c) continue;
        try {
          await this.simCharacter(c);
          if (this.afterSim) await this.afterSim(id).catch((e) => this.log.warn(`afterSim: ${(e as Error).message}`));
        } catch (e) {
          this.log.warn(`sim ${c.name}: ${(e as Error).message}`);
        }
      }
    } finally {
      this.working = false;
      this.current = null;
    }
  }

  // ------------------------------------------------------------ сим одного персонажа

  async simCharacter(c: CharacterRow): Promise<{ profilesets: number; baseline: number; elapsedMs: number }> {
    const cfg = this.config.get();
    const simCfg = cfg.sim;
    const info = this.runner.locate(simCfg.simcPath);
    if (!info.path) throw new Error("SimulationCraft не установлен — нажмите «Установить SimC» в настройках автосима");
    const specId = c.activeSpecId;
    if (!specId) throw new Error("У персонажа нет активной спеки (синк профиля)");
    const spec = SPEC_BY_ID.get(specId);
    if (!spec) throw new Error(`Неизвестная спека ${specId}`);
    if (spec.role === "HEALER") throw new Error("Хилы: SimC не симулирует лечение");
    const equipment = this.chars.equipment(c.id);
    if (equipment.length === 0) throw new Error("Нет экипировки (синк профиля)");
    const role = spec.role === "TANK" ? "tank" : "attack";

    const runId = Number(this.db.conn.prepare("INSERT INTO sim_runs(character_id, spec_id, started_at, equipment_hash) VALUES (?, ?, ?, ?)").run(c.id, specId, Date.now(), this.equipmentHash(c)).lastInsertRowid);
    this.current = { characterId: c.id, name: c.name, stage: "подготовка", startedAt: Date.now() };
    const dir = path.join(CACHE_DIR, "sim", String(c.id));
    fs.mkdirSync(dir, { recursive: true });

    try {
      // --- профиль
      // таланты: ручные → штатный профиль SimC (single-target) → таланты персонажа
      let talents: string | null = null;
      let talentsNote2: string | null = null;
      if (c.talentsOverride) {
        talents = c.talentsOverride;
        talentsNote2 = "ручные";
      } else if (simCfg.talentsSource === "simc-profile") {
        const def = defaultTalentsFromProfiles(info.path, c.classId, specId);
        if (def) {
          talents = def.talents;
          talentsNote2 = `профиль SimC ${def.source}`;
        }
      }
      const profile = buildSimcProfile({ character: c, specId, equipment, role, talents, talentsNote: talentsNote2 });

      // --- кандидаты
      const season = cfg.season;
      const seasonId = season.seasonId;
      const tracks = trackBonusIds(this.staticData.getBonuses(), seasonId);
      const raidItems = season.raidInstanceIds.flatMap((id) => this.staticData.instanceLoot(id).map((it) => ({ ...it, instanceId: id })));
      const dungeonItems = season.dungeonInstanceIds.flatMap((id) => this.staticData.instanceLoot(id).map((it) => ({ ...it, instanceId: id })));
      const hasOffHand = equipment.some((e) => e.slot === "OFF_HAND");
      const cands = buildSimCandidates({
        specId, classId: c.classId, raidItems, dungeonItems,
        raidTracks: simCfg.raidTracks, dungeonTracks: simCfg.dungeonTracks, tracks,
        resolveItem: (id) => this.staticData.item(id),
        hasOffHand, usesTwoHand: false,
      });
      if (cands.length === 0) throw new Error("Нет кандидатов для сима (справочники/сезон не загружены?)");

      // --- входной файл
      const threads = simCfg.threads > 0 ? simCfg.threads : Math.max(1, os.cpus().length - 1);
      const lines: string[] = [];
      lines.push(profile.text);
      lines.push(`iterations=15000`);
      lines.push(`target_error=${simCfg.targetError}`);
      lines.push(`threads=${threads}`);
      lines.push(`fight_style=${simCfg.fightStyle}`);
      lines.push(`optimal_raid=1`);
      lines.push(`max_time=300`);
      lines.push(`report_details=0`);
      lines.push(`single_actor_batch=1`);
      if (role === "tank") {
        lines.push(`tank_dummy=mythic`);
        lines.push(`profileset_metric=dps,dtps,hps`);
      }
      // ценность тир-сета: принудительно вкл/выкл 2pc/4pc
      const tierName = simCfg.tierSetName || autoTierSetName(cfg.season.label);
      const tierPieces = this.tierPiecesOf?.(c) ?? null;
      if (tierName) {
        lines.push(`profileset."tier/2on"+=set_bonus=${tierName}_2pc=1`);
        lines.push(`profileset."tier/2off"+=set_bonus=${tierName}_2pc=0`);
        lines.push(`profileset."tier/4on"+=set_bonus=${tierName}_4pc=1`);
        lines.push(`profileset."tier/4off"+=set_bonus=${tierName}_4pc=0`);
      }
      lines.push(`json2=result.json`);
      lines.push("");
      for (const cnd of cands) lines.push(profilesetLine(cnd, { clearOffHand: hasOffHand }));
      const input = path.join(dir, "input.simc");
      fs.writeFileSync(input, lines.join("\n") + "\n", "utf8");

      // --- запуск
      this.current = { characterId: c.id, name: c.name, stage: `sim 0/${cands.length}`, startedAt: Date.now() };
      const runOnce = () =>
        this.runner.run(info.path!, "input.simc", dir, path.join(dir, "result.json"), {
          onProgress: (line) => {
            const m = /Profilesets[^:]*:\s*(\d+)\/(\d+)/.exec(line);
            if (m && this.current) this.current.stage = `sim ${m[1]}/${m[2]}`;
          },
        });
      let res;
      let talentsNote = "";
      try {
        res = await runOnce();
      } catch (e) {
        const msg = (e as Error).message;
        // simc не принял код талантов (новый формат/повреждён) — повторяем с талантами по умолчанию
        if (/Hash|talent/i.test(msg) && profile.text.includes("talents=")) {
          const def = defaultTalentsFromProfiles(info.path!, c.classId, specId);
          const lines2 = fs.readFileSync(input, "utf8").split("\n").filter((l) => !l.startsWith("talents="));
          if (def) lines2.splice(lines2.findIndex((l) => l.startsWith("spec=")) + 1, 0, `talents=${def.talents}`);
          fs.writeFileSync(input, lines2.join("\n"), "utf8");
          this.log.warn(`sim ${c.name}: код талантов отклонён simc, использую таланты ${def ? `из профиля SimC ${def.source}` : "по умолчанию"}`);
          talentsNote = def ? ` (таланты из профиля SimC ${def.source})` : " (без талантов!)";
          res = await runOnce();
        } else throw e;
      }

      // --- разбор
      const parsed = this.parseResult(res.json, cands, role, simCfg.tankWeights, simCfg.fightStyle);
      const tier = parseTierValues(res.json, parsed.baseline, tierPieces ?? 0);
      this.bisRepo.replaceCandidates("simc", specId, c.id, parsed.candidates, Date.now());
      this.bisRepo.addSimReport({
        characterId: c.id, specId, kind: "simc", reportId: null, url: null, simDate: Date.now(), baselineDps: parsed.baseline,
        fightStyle: simCfg.fightStyle, meta: { profilesets: cands.length, elapsedMs: res.elapsedMs, role, targetError: simCfg.targetError },
      });
      this.db.conn
        .prepare("UPDATE sim_runs SET finished_at = ?, ok = 1, message = ?, profilesets = ?, baseline = ?, elapsed_ms = ?, tier_pieces = ?, tier2_pct = ?, tier4_pct = ? WHERE id = ?")
        .run(Date.now(), `OK: ${cands.length} профильсетов за ${Math.round(res.elapsedMs / 1000)} с${talentsNote}${talentsNote2 ? ` (таланты: ${talentsNote2})` : ""}`, cands.length, parsed.baseline, res.elapsedMs, tierPieces, tier.val2, tier.val4, runId);
      this.log.info(`sim ${c.name}: ${cands.length} профильсетов, base ${Math.round(parsed.baseline)}, ${Math.round(res.elapsedMs / 1000)} с`);
      return { profilesets: cands.length, baseline: parsed.baseline, elapsedMs: res.elapsedMs };
    } catch (e) {
      this.db.conn.prepare("UPDATE sim_runs SET finished_at = ?, ok = 0, message = ? WHERE id = ?").run(Date.now(), (e as Error).message.slice(0, 500), runId);
      throw e;
    } finally {
      this.current = null;
    }
  }

  private parseResult(
    json: any,
    cands: SimCandidate[],
    role: "attack" | "tank",
    tankWeights: { dps: number; dtps: number; hps: number },
    fightStyle: string,
  ): { baseline: number; candidates: ParsedCandidate[] } {
    const player = json?.sim?.players?.[0];
    const cd = player?.collected_data;
    const baseline: number = cd?.dps?.mean ?? 0;
    // в json2 collected_data.dtps — суммарный урон за бой; нормализуем по длине боя и сверяем с медианой профильсетов
    const fightLen: number = cd?.fight_length?.mean || 1;
    const rawDtps: number = cd?.dtps?.mean ?? 0;
    const psDtps = (json?.sim?.profilesets?.results ?? [])
      .flatMap((r: any) => (r.additional_metrics ?? []).filter((m: any) => /Damage Taken/i.test(m.metric)).map((m: any) => m.mean))
      .sort((a: number, b: number) => a - b);
    const medianDtps = psDtps.length ? psDtps[Math.floor(psDtps.length / 2)] : 0;
    const baseDtps = medianDtps && Math.abs(rawDtps / fightLen - medianDtps) < Math.abs(rawDtps - medianDtps) ? rawDtps / fightLen : rawDtps;
    const rawHps: number = cd?.hps?.mean ?? 0;
    const psHps = (json?.sim?.profilesets?.results ?? [])
      .flatMap((r: any) => (r.additional_metrics ?? []).filter((m: any) => /Healing per Second/i.test(m.metric)).map((m: any) => m.mean))
      .sort((a: number, b: number) => a - b);
    const medianHps = psHps.length ? psHps[Math.floor(psHps.length / 2)] : 0;
    const baseHps = medianHps && Math.abs(rawHps / fightLen - medianHps) < Math.abs(rawHps - medianHps) ? rawHps / fightLen : rawHps;
    const errPct: number | undefined = cd?.dps?.mean_std_dev && baseline ? (cd.dps.mean_std_dev / baseline) * 100 : undefined;
    const results: any[] = json?.sim?.profilesets?.results ?? [];
    const byName = new Map(cands.map((c) => [c.name, c]));

    // лучший результат по (itemId, track) среди слотов finger1/finger2 и т.п.
    const best = new Map<string, { cand: SimCandidate; score: number; meta: SimCandidateMeta }>();
    for (const r of results) {
      const cand = byName.get(r.name);
      if (!cand || typeof r.mean !== "number") continue;
      const dpsPct = baseline ? ((r.mean - baseline) / baseline) * 100 : 0;
      let dtpsPct: number | null = null;
      let hpsPct: number | null = null;
      if (role === "tank" && Array.isArray(r.additional_metrics)) {
        const dt = r.additional_metrics.find((m: any) => /Damage Taken/i.test(m.metric));
        const hp = r.additional_metrics.find((m: any) => /Healing per Second/i.test(m.metric));
        if (dt && baseDtps) dtpsPct = ((dt.mean - baseDtps) / baseDtps) * 100;
        if (hp && baseHps) hpsPct = ((hp.mean - baseHps) / baseHps) * 100;
      }
      const score =
        role === "tank"
          ? dpsPct * tankWeights.dps - (dtpsPct ?? 0) * tankWeights.dtps + (hpsPct ?? 0) * tankWeights.hps
          : dpsPct;
      const meta: SimCandidateMeta = {
        kind: "simc", track: cand.track, trackBonusId: cand.bonusId, slotUsed: cand.simcSlot, tokenId: cand.tokenId ?? undefined,
        encounterId: cand.encounterId, instanceId: cand.instanceId, base: baseline, mean: r.mean, delta: r.mean - baseline,
        dtpsPct, hpsPct, role: role === "tank" ? "tank" : "dps", fightStyle, error: errPct,
      };
      const key = `${cand.itemId}|${cand.track}`;
      const prev = best.get(key);
      if (!prev || score > prev.score) best.set(key, { cand, score, meta });
    }

    // → ParsedCandidate: по слоту ранжируем по score
    const bySlot = new Map<string, Array<{ cand: SimCandidate; score: number; meta: SimCandidateMeta }>>();
    for (const v of best.values()) {
      const slot = v.cand.canonSlot === "TWO_HAND" || v.cand.canonSlot === "WEAPON" || v.cand.canonSlot === "RANGED" ? "MAIN_HAND" : v.cand.canonSlot;
      const arr = bySlot.get(slot) ?? [];
      arr.push(v);
      bySlot.set(slot, arr);
    }
    const out: ParsedCandidate[] = [];
    for (const [slot, arr] of bySlot) {
      arr.sort((a, b) => b.score - a.score);
      arr.forEach((v, i) => {
        out.push({
          list: "sim",
          slot,
          rank: i + 1,
          itemId: v.cand.itemId,
          bonusIds: [v.cand.bonusId],
          originalItemId: null,
          itemName: null,
          sourceNote: `SimC ${v.cand.track}${v.cand.tokenId ? " (токен)" : ""}`,
          score: Math.round(v.score * 100) / 100,
          meta: v.meta,
        });
      });
    }
    return { baseline, candidates: out };
  }
}

export type { ItemRow };

/** «Season 2» → mid2 (Midnight); для других дополнений — расширить таблицу. */
export function autoTierSetName(seasonLabel: string): string | null {
  const m = /season\s*(\d+)/i.exec(seasonLabel);
  if (!m) return null;
  return `mid${m[1]}`;
}

/** Ценность 2pc/4pc в % относительно базы: если бонус есть — сколько теряем при выключении, если нет — сколько даёт включение. */
export function parseTierValues(json: any, baseline: number, pieces: number): { val2: number | null; val4: number | null } {
  const results: any[] = json?.sim?.profilesets?.results ?? [];
  const get = (name: string): number | null => {
    const r = results.find((x) => x.name === name);
    return r && typeof r.mean === "number" ? r.mean : null;
  };
  if (!baseline) return { val2: null, val4: null };
  const pct = (v: number) => Math.round((v / baseline) * 10000) / 100;
  const on2 = get("tier/2on"), off2 = get("tier/2off"), on4 = get("tier/4on"), off4 = get("tier/4off");
  const val4 = pieces >= 4 ? (off4 != null ? pct(baseline - off4) : null) : on4 != null ? pct(on4 - baseline) : null;
  const val2 = pieces >= 2 ? (off2 != null ? pct(baseline - off2) : null) : on2 != null ? pct(on2 - baseline) : null;
  return { val2, val4 };
}
