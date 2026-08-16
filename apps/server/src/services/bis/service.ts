import {
  SPECS,
  SPEC_BY_ID,
  rclcKeyForExport,
  type BisCharacterView,
  type BisSource,
  type BisSourceStatus,
  type BisTeamRow,
  type CharacterRow,
  type ItemWanter,
  type ObtainedStatus,
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
    const sources: BisSourceStatus[] = (["icyveins", "wcl", "droptimizer", "manual"] as BisSource[]).map((source) => ({
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

  characterBis(character: CharacterRow, specId?: number): BisCharacterView | null {
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
    });
  }

  team(): BisTeamRow[] {
    const rows: BisTeamRow[] = [];
    for (const c of this.chars.listRaiders()) {
      const view = this.characterBis(c);
      const perSlot: Record<string, ObtainedStatus | "none"> = {};
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
        perSlot,
      });
    }
    return rows;
  }

  /** Кому из ростера нужен предмет (учитывая тир-токены и катализатор). */
  wanters(itemId: number): ItemWanter[] {
    const item = this.staticData.item(itemId);
    const targetIds = new Set<number>([itemId]);
    if (item?.contains) for (const id of item.contains) targetIds.add(id);
    const out: ItemWanter[] = [];
    for (const c of this.chars.listRaiders()) {
      const view = this.characterBis(c);
      if (!view) continue;
      for (const s of view.slots) {
        for (const e of s.entries) {
          if (!targetIds.has(e.itemId) && !(e.originalItemId && targetIds.has(e.originalItemId))) continue;
          const eqIlvl = s.equipped.length ? Math.min(...s.equipped.map((x) => x.ilvl ?? 0)) : null;
          const sim = e.sources.find((x) => x.source === "droptimizer");
          out.push({
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
            upgradePct: sim?.score ?? null,
            equippedIlvl: eqIlvl,
          });
        }
      }
    }
    // сортировка: не получено → ниже трек → есть; затем ранг, затем балл
    const order: Record<ObtainedStatus, number> = { no: 0, catalyst: 1, lower: 2, yes: 3 };
    out.sort((a, b) => order[a.obtained] - order[b.obtained] || a.rank - b.rank || b.score - a.score);
    return out;
  }

  /** Карта itemId → wanters для набора предметов (страница лута). */
  wantersForItems(itemIds: number[]): Record<number, ItemWanter[]> {
    // один проход по ростеру, чтобы не пересчитывать BiS N раз
    const views = this.chars
      .listRaiders()
      .map((c) => ({ c, view: this.characterBis(c) }))
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
            const sim = e.sources.find((x) => x.source === "droptimizer");
            list.push({
              characterId: c.id, name: c.name, realmName: c.realmName, classId: c.classId, specId: view.specId, slot: s.slot,
              rank: e.rank, score: e.score, obtained: e.obtained, obtainedDetail: e.obtainedDetail, upgradePct: sim?.score ?? null,
              equippedIlvl: s.equipped.length ? Math.min(...s.equipped.map((x) => x.ilvl ?? 0)) : null,
            });
          }
        }
      }
      const order: Record<ObtainedStatus, number> = { no: 0, catalyst: 1, lower: 2, yes: 3 };
      list.sort((a, b) => order[a.obtained] - order[b.obtained] || a.rank - b.rank || b.score - a.score);
      if (list.length) result[itemId] = list;
    }
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
