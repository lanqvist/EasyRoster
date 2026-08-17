import {
  isSimSource,
  SPECS,
  SPEC_BY_ID,
  rclcKeyForExport,
  type BisCharacterView,
  type BisEntry,
  compareWantersByBenefit,
  type BisSource,
  type BisSourceStatus,
  type BisTeamRow,
  type CharacterRow,
  type ItemWanter,
  type ObtainedStatus,
  type RaidDifficulty,
  type SourceKind,
} from "@easyroster/core";
import type { ConfigService } from "../config.js";
import type { Db } from "../db.js";
import type { StaticDataService } from "../static-data.js";
import type { CharactersRepo } from "../characters-repo.js";
import { BisRepo } from "./repo.js";
import { buildCharacterBis } from "./engine.js";
import { fetchIcyVeins } from "./icyveins.js";
import { WclClient, aggregateGear, wclClassName, wclSpecName } from "./wcl.js";
import { droptimizerCandidates, extractReportId, fetchDroptimizerReport, parseDroptimizerJson } from "./droptimizer.js";
import type { Logger } from "../../context.js";

export interface BisProgress {
  source: BisSource;
  done: number;
  total: number;
  current: string;
}

export class BisService {
  readonly repo: BisRepo;
  /** Поставщик истории лута: ключ RCLC (lower) → itemId → ts. Устанавливается контекстом. */
  historyProvider: (() => Map<string, Map<number, number>>) | null = null;
  private historyCache: { at: number; data: Map<string, Map<number, number>> } | null = null;
  private running: Partial<Record<BisSource, boolean>> = {};
  private progress: BisProgress | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: ConfigService,
    private readonly staticData: StaticDataService,
    private readonly chars: CharactersRepo,
    private readonly log: Logger,
  ) {
    this.repo = new BisRepo(db);
  }

  // ------------------------------------------------------------ статус

  status(): { sources: BisSourceStatus[]; progress: BisProgress | null } {
    const stats = new Map(this.repo.sourceStats().map((s) => [s.source, s]));
    const sources: BisSourceStatus[] = (["icyveins", "wcl", "droptimizer", "simc", "manual"] as BisSource[]).map((source) => ({
      source,
      specs: stats.get(source)?.specs ?? 0,
      candidates: stats.get(source)?.candidates ?? 0,
      lastRun: this.repo.lastRun(source),
      running: !!this.running[source],
    }));
    return { sources, progress: this.progress };
  }

  /** Спеки, нужные ростеру (активные спеки рейдеров). */
  rosterSpecIds(): number[] {
    const set = new Set<number>();
    for (const c of this.chars.listRaiders()) if (c.activeSpecId) set.add(c.activeSpecId);
    return [...set];
  }

  // ------------------------------------------------------------ Icy Veins

  async refreshIcyVeins(specIds?: number[]): Promise<{ ok: number; failed: number; messages: string[] }> {
    if (this.running.icyveins) throw new Error("Обновление Icy Veins уже идёт");
    const ids = specIds && specIds.length ? specIds : this.rosterSpecIds().length ? this.rosterSpecIds() : SPECS.map((s) => s.id);
    this.running.icyveins = true;
    const runId = this.repo.runStart("icyveins", ids.length === 1 ? ids[0]! : null);
    const messages: string[] = [];
    let ok = 0;
    let failed = 0;
    try {
      let i = 0;
      for (const specId of ids) {
        this.progress = { source: "icyveins", done: i++, total: ids.length, current: SPEC_BY_ID.get(specId)?.name ?? String(specId) };
        try {
          const parsed = await fetchIcyVeins(specId);
          this.repo.replaceCandidates("icyveins", specId, null, parsed.candidates, Date.now());
          ok++;
        } catch (e) {
          failed++;
          messages.push(`${SPEC_BY_ID.get(specId)?.name ?? specId}: ${(e as Error).message}`);
          this.log.warn(`icyveins ${specId}: ${(e as Error).message}`);
        }
        await sleep(800); // вежливая пауза между страницами
      }
      const msg = `Icy Veins: спек ок ${ok}, ошибок ${failed}`;
      this.repo.runFinish(runId, failed === 0, msg + (messages.length ? ` — ${messages.slice(0, 3).join("; ")}` : ""));
      this.log.info(msg);
      return { ok, failed, messages };
    } finally {
      this.running.icyveins = false;
      this.progress = null;
    }
  }

  // ------------------------------------------------------------ Warcraft Logs

  private wclClient(): WclClient {
    const cfg = this.config.get();
    return new WclClient(cfg.warcraftLogs);
  }

  /** Найти WCL-зону текущего рейда сезона по названиям боссов. */
  private async resolveWclEncounters(client: WclClient): Promise<Array<{ id: number; name: string }>> {
    const season = this.staticData.seasonInfo();
    const raidEncNames = new Set<string>();
    for (const r of season.raids) for (const e of r.encounters) if (e.id > 0) raidEncNames.add(e.name.toLowerCase());
    if (raidEncNames.size === 0) throw new Error("Рейды сезона не определены — обновите справочники");
    const zones = await client.zones();
    let best: { zone: (typeof zones)[number]; hits: number } | null = null;
    for (const z of zones) {
      const hits = z.encounters.filter((e) => raidEncNames.has(e.name.toLowerCase())).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { zone: z, hits };
    }
    if (!best) throw new Error("Warcraft Logs ещё не добавил зону рейда сезона (появляется в день открытия рейда) — повторите позже; пока работают Icy Veins и Droptimizer");
    return best.zone.encounters.filter((e) => raidEncNames.has(e.name.toLowerCase()));
  }

  async refreshWcl(specIds?: number[]): Promise<{ ok: number; failed: number; messages: string[]; pointsSpent?: number }> {
    if (this.running.wcl) throw new Error("Обновление Warcraft Logs уже идёт");
    const cfg = this.config.get();
    if (!cfg.warcraftLogs.clientId || !cfg.warcraftLogs.clientSecret) throw new Error("Не заданы ключи Warcraft Logs (Настройки)");
    const ids = specIds && specIds.length ? specIds : this.rosterSpecIds().length ? this.rosterSpecIds() : SPECS.map((s) => s.id);
    this.running.wcl = true;
    const runId = this.repo.runStart("wcl", ids.length === 1 ? ids[0]! : null);
    const messages: string[] = [];
    let ok = 0;
    let failed = 0;
    try {
      const client = this.wclClient();
      const encounters = await this.resolveWclEncounters(client);
      let i = 0;
      for (const specId of ids) {
        const spec = SPEC_BY_ID.get(specId);
        if (!spec) continue;
        this.progress = { source: "wcl", done: i++, total: ids.length, current: spec.name };
        try {
          const rankings = [];
          const metric = spec.role === "HEALER" ? "hps" : "dps";
          for (const enc of encounters) {
            for (let page = 1; page <= cfg.bis.wclPagesPerEncounter; page++) {
              const r = await client.characterRankings({
                encounterId: enc.id,
                className: wclClassName(spec.classId),
                specName: wclSpecName(specId),
                difficulty: cfg.bis.wclDifficulty,
                metric,
                page,
              });
              rankings.push(...r.rankings);
              if (!r.hasMorePages) break;
            }
          }
          // если Mythic ещё пуст (начало сезона) — пробуем Heroic
          let effective = rankings;
          if (effective.length < 20 && cfg.bis.wclDifficulty === 5) {
            for (const enc of encounters) {
              const r = await client.characterRankings({ encounterId: enc.id, className: wclClassName(spec.classId), specName: wclSpecName(specId), difficulty: 4, metric, page: 1 });
              effective = effective.concat(r.rankings);
            }
          }
          const cands = aggregateGear(effective, cfg.bis.wclMinSharePct);
          this.repo.replaceCandidates("wcl", specId, null, cands, Date.now());
          ok++;
        } catch (e) {
          failed++;
          messages.push(`${spec.name}: ${(e as Error).message}`);
          this.log.warn(`wcl ${specId}: ${(e as Error).message}`);
          if (/429|rate/i.test((e as Error).message)) break;
        }
      }
      let pointsSpent: number | undefined;
      try {
        pointsSpent = (await client.rateLimit()).pointsSpentThisHour;
      } catch {
        /* ignore */
      }
      const msg = `Warcraft Logs: спек ок ${ok}, ошибок ${failed}${pointsSpent != null ? `, очков за час: ${pointsSpent}` : ""}`;
      this.repo.runFinish(runId, failed === 0, msg + (messages.length ? ` — ${messages.slice(0, 3).join("; ")}` : ""));
      this.log.info(msg);
      return { ok, failed, messages, pointsSpent };
    } catch (e) {
      this.repo.runFinish(runId, false, (e as Error).message);
      throw e;
    } finally {
      this.running.wcl = false;
      this.progress = null;
    }
  }

  // ------------------------------------------------------------ Droptimizer

  async importDroptimizer(character: CharacterRow, url: string): Promise<{ reportId: string; results: number; candidates: number; warning: string | null }> {
    const reportId = extractReportId(url);
    if (!reportId) throw new Error("Не удалось распознать ссылку Raidbots (ожидается …/simbot/report/ID)");
    const json = await fetchDroptimizerReport(reportId);
    const report = parseDroptimizerJson(reportId, json, (id) => !!this.staticData.item(id));
    if (report.results.length === 0) throw new Error("В отчёте нет результатов Droptimizer (это Droptimizer, а не Top Gear/Quick Sim?)");
    let warning: string | null = null;
    if (report.character.name && report.character.name.toLowerCase() !== character.name.toLowerCase()) {
      warning = `Отчёт для персонажа «${report.character.name}», а импортируется в «${character.name}»`;
    }
    const cands = droptimizerCandidates(report, (id) => this.staticData.item(id)?.slot ?? null);
    const specId = character.activeSpecId ?? 0;
    this.repo.replaceCandidates("droptimizer", specId, character.id, cands, Date.now());
    this.repo.addSimReport({
      characterId: character.id, specId, kind: "droptimizer", reportId, url, simDate: report.date, baselineDps: report.baselineDps,
      fightStyle: report.fightStyle, meta: { character: report.character, simType: report.simType, results: report.results.length },
    });
    return { reportId, results: report.results.length, candidates: cands.length, warning };
  }

  // ------------------------------------------------------------ вычисление

  private itemsForCandidates(ids: number[]) {
    return this.staticData.items(ids);
  }

  private wonFor(character: CharacterRow): Map<number, number> | undefined {
    if (!this.historyProvider) return undefined;
    if (!this.historyCache || Date.now() - this.historyCache.at > 10_000) {
      this.historyCache = { at: Date.now(), data: this.historyProvider() };
    }
    return this.historyCache.data.get(rclcKeyForExport(character.name, character.realmName || character.realmSlug).toLowerCase());
  }

  invalidateHistoryCache(): void {
    this.historyCache = null;
  }

  /** Тип источника инстанса по сезону. */
  sourceKindOf(instanceId: number): SourceKind {
    const s = this.config.get().season;
    if (s.dungeonInstanceIds.includes(instanceId) || instanceId === -1) return "mplus";
    if (s.raidInstanceIds.includes(instanceId)) {
      const inst = this.staticData.instance(instanceId);
      return inst && inst.encounters.length <= 1 ? "world" : "raid";
    }
    const inst = this.staticData.instance(instanceId);
    if (inst?.type === "raid") return "raid";
    if (inst?.type === "mplus-chest" || inst?.type === "expansion-dungeon" || inst?.type === "dungeon") return "mplus";
    return "other";
  }

  /** трек → ilvl для сезона (из bonuses) */
  trackIlvls(): Map<string, number | null> {
    const seasonId = this.config.get().season.seasonId;
    const out = new Map<string, number | null>();
    for (const b of this.staticData.getBonuses().values()) {
      const u = b.upgrade;
      if (!u || u.level !== 1) continue;
      if (seasonId != null ? u.seasonId !== seasonId : u.seasonId == null) continue;
      out.set(u.name, u.itemLevel ?? b.itemLevel?.amount ?? null);
    }
    return out;
  }

  characterBis(character: CharacterRow, specId?: number, opts: { difficulty?: RaidDifficulty } = {}): BisCharacterView | null {
    const spec = specId ?? character.activeSpecId;
    if (!spec) return null;
    const cfg = this.config.get();
    const candidates = this.repo.candidatesForSpec(spec, character.id);
    const manual = this.repo.manualRules(spec, character.id);
    const equipment = this.chars.equipment(character.id);
    const ids = new Set<number>();
    for (const c of candidates) {
      ids.add(c.itemId);
      if (c.originalItemId) ids.add(c.originalItemId);
    }
    for (const m of manual) ids.add(m.itemId);
    for (const e of equipment) ids.add(e.itemId);
    const items = this.itemsForCandidates([...ids]);
    return buildCharacterBis({
      characterId: character.id,
      specId: spec,
      candidates,
      manual,
      equipment,
      items,
      itemSources: (id) => this.staticData.itemSources(id),
      bonuses: this.staticData.getBonuses(),
      weights: cfg.bis.weights,
      perSlot: cfg.bis.perSlot,
      simMaxAgeMs: cfg.bis.simMaxAgeDays * 86400000,
      now: Date.now(),
      won: this.wonFor(character),
      sourceKindOf: (id) => this.sourceKindOf(id),
      raidDifficulty: opts.difficulty ?? cfg.season.raidDifficulty,
      trackIlvl: this.trackIlvls(),
      dungeonTrack: cfg.sim.dungeonTracks[0] ?? "Hero",
    });
  }

  team(difficulty?: RaidDifficulty): BisTeamRow[] {
    const rows: BisTeamRow[] = [];
    for (const c of this.chars.listRaiders()) {
      const view = this.characterBis(c, undefined, { difficulty });
      const perSlot: Record<string, ObtainedStatus | "none"> = {};
      const perSlotBest: BisTeamRow["perSlotBest"] = {};
      // потенциал апгрейда: сумма лучших положительных % по слотам (только по симу), с разбивкой по источнику лучшего предмета
      let potential: BisTeamRow["potential"] = null;
      if (view?.personalSim) {
        potential = { total: 0, raid: 0, mplus: 0, slotsRaid: 0, slotsMplus: 0, slots: 0 };
        for (const s of view.slots) {
          const cands = s.entries.filter((e) => e.obtained !== "yes" && e.simSelected && e.simSelected.pct > 0.05);
          if (!cands.length) continue;
          const top = cands.reduce((x, y) => (y.simSelected!.pct > x.simSelected!.pct ? y : x));
          const isRaid = top.sourceKind === "raid" || top.sourceKind === "catalyst" || top.sourceKind === "world";
          const isM = top.sourceKind === "mplus" || top.sourceKind === "vault";
          potential.total += top.simSelected!.pct;
          potential.slots++;
          if (isRaid) { potential.raid += top.simSelected!.pct; potential.slotsRaid++; }
          if (isM) { potential.mplus += top.simSelected!.pct; potential.slotsMplus++; }
        }
        potential.total = Math.round(potential.total * 10) / 10;
        potential.raid = Math.round(potential.raid * 10) / 10;
        potential.mplus = Math.round(potential.mplus * 10) / 10;
      }
      if (view) {
        for (const s of view.slots) {
          const need = s.slot === "FINGER" || s.slot === "TRINKET" ? 2 : 1;
          const best = s.entries.slice(0, need);
          if (best.length === 0) {
            perSlot[s.slot] = "none";
            continue;
          }
          // худший статус среди нужных
          const order: ObtainedStatus[] = ["yes", "lower", "catalyst", "no"];
          perSlot[s.slot] = best.map((b) => b.obtained).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]!;
          const top = best.find((b) => b.obtained !== "yes") ?? best[0]!;
          perSlotBest[s.slot] = { pct: top.simSelected?.pct ?? null, name: top.itemNameRu ?? top.itemName, obtained: top.obtained, kind: top.sourceKind };
        }
      }
      rows.push({
        characterId: c.id,
        name: c.name,
        realmName: c.realmName,
        classId: c.classId,
        specId: c.activeSpecId,
        ilvl: c.ilvlEquipped,
        coverage: view?.coverage ?? null,
        potential,
        perSlot,
        perSlotBest,
        hasSim: !!view?.personalSim,
        simAt: view?.personalSim?.fetchedAt ?? null,
        role: c.activeSpecId ? SPEC_BY_ID.get(c.activeSpecId)?.role ?? null : null,
      });
    }
    return rows;
  }

  /** Строка «кому нужен» из записи BiS: сим-%, разница ilvl к надетому (для хилов/без сима), альтернативы. */
  private wanterOf(c: CharacterRow, view: BisCharacterView, s: BisCharacterView["slots"][number], e: BisEntry): ItemWanter {
    const sim = e.sources.find((x) => isSimSource(x.source));
    // для парных слотов сравниваем с худшим из надетых (его и заменит предмет)
    const worst = s.equipped.length ? s.equipped.reduce((a, b) => ((b.ilvl ?? 0) < (a.ilvl ?? 0) ? b : a)) : null;
    const eqIlvl = worst?.ilvl ?? null;
    const dropIlvl = e.dropTrack?.ilvl ?? null;
    return {
      characterId: c.id,
      name: c.name,
      realmName: c.realmName,
      classId: c.classId,
      specId: view.specId,
      slot: s.slot,
      rank: e.rank,
      score: e.score,
      obtained: e.obtained,
      obtainedDetail: e.obtainedDetail,
      upgradePct: e.simSelected?.pct ?? sim?.score ?? null,
      equippedIlvl: eqIlvl,
      equippedTrack: worst?.track ?? null,
      dropIlvl,
      ilvlDelta: dropIlvl != null && eqIlvl != null ? dropIlvl - eqIlvl : null,
      simTrack: e.simSelected?.track ?? null,
      simByTrack: e.simByTrack,
      alt: e.alternatives,
      sourceKind: e.sourceKind,
    };
  }

  /** Кому из ростера нужен предмет (учитывая тир-токены и катализатор). */
  wanters(itemId: number, difficulty?: RaidDifficulty): ItemWanter[] {
    return this.wantersForItems([itemId], difficulty)[itemId] ?? [];
  }

  /** Карта itemId → wanters для набора предметов (страница лута). */
  wantersForItems(itemIds: number[], difficulty?: RaidDifficulty): Record<number, ItemWanter[]> {
    // один проход по ростеру, чтобы не пересчитывать BiS N раз
    const views = this.chars
      .listRaiders()
      .map((c) => ({ c, view: this.characterBis(c, undefined, { difficulty }) }))
      .filter((x): x is { c: CharacterRow; view: BisCharacterView } => !!x.view);
    const result: Record<number, ItemWanter[]> = {};
    const items = this.staticData.items(itemIds);
    for (const itemId of itemIds) {
      const targetIds = new Set<number>([itemId]);
      const contains = items.get(itemId)?.contains;
      if (contains) for (const id of contains) targetIds.add(id);
      const list: ItemWanter[] = [];
      for (const { c, view } of views) {
        for (const s of view.slots) {
          for (const e of s.entries) {
            if (!targetIds.has(e.itemId) && !(e.originalItemId && targetIds.has(e.originalItemId))) continue;
            list.push(this.wanterOf(c, view, s, e));
          }
        }
      }
      list.sort(compareWantersByBenefit);
      if (list.length) result[itemId] = list;
    }
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
