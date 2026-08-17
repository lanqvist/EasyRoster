import { CLASS_IDS, INVENTORY_TYPE_TO_SLOT, decodeTrack, type BonusEntry, type CharacterRow, type EquipmentRow, type ItemRow, type TierRow, type TierTokenView } from "@easyroster/core";
import type { ConfigService } from "./config.js";
import type { Db } from "./db.js";
import type { StaticDataService } from "./static-data.js";
import type { CharactersRepo } from "./characters-repo.js";
import type { BisService } from "./bis/service.js";

export const TIER_SLOTS = ["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"] as const;

/**
 * Тир-сет сезона: наборы по классам (из тир-токенов рейда), прогресс персонажей,
 * ценность 2pc/4pc из сима, приоритет, кому какой токен.
 */
export class TierService {
  constructor(
    private readonly db: Db,
    private readonly config: ConfigService,
    private readonly staticData: StaticDataService,
    private readonly chars: CharactersRepo,
    private readonly bis: BisService,
  ) {}

  /** setId → { classId, slots: {slot: itemId} } — из содержимого тир-токенов рейдов сезона. */
  seasonTierSets(): Map<number, { classId: number | null; items: Map<string, number> }> {
    const out = new Map<number, { classId: number | null; items: Map<string, number> }>();
    for (const inst of this.staticData.seasonInfo().raids) {
      for (const tok of this.staticData.instanceLoot(inst.id)) {
        if (!tok.contains) continue;
        for (const id of tok.contains) {
          const it = this.staticData.item(id);
          if (!it?.itemSetId || it.inventoryType == null) continue;
          const slot = INVENTORY_TYPE_TO_SLOT[it.inventoryType];
          if (!slot) continue;
          let s = out.get(it.itemSetId);
          if (!s) out.set(it.itemSetId, (s = { classId: it.allowableClasses?.[0] ?? null, items: new Map() }));
          s.items.set(slot, id);
        }
      }
    }
    return out;
  }

  /** Токены сезона: tokenId → { name, encounter, contains } */
  tokens(): Array<{ id: number; name: string; nameRu: string | null; icon: string | null; instanceName: string; encounterName: string; encounterId: number; contains: number[] }> {
    const out: Array<{ id: number; name: string; nameRu: string | null; icon: string | null; instanceName: string; encounterName: string; encounterId: number; contains: number[] }> = [];
    for (const inst of this.staticData.seasonInfo().raids) {
      const encNames = new Map(inst.encounters.map((e) => [e.id, e.name]));
      for (const tok of this.staticData.instanceLoot(inst.id)) {
        if (!tok.contains) continue;
        out.push({ id: tok.id, name: tok.name, nameRu: tok.nameRu, icon: tok.icon, instanceName: inst.name, encounterName: encNames.get(tok.encounterId) ?? `#${tok.encounterId}`, encounterId: tok.encounterId, contains: tok.contains });
      }
    }
    return out;
  }

  private isCatalyzable(e: EquipmentRow, bonuses: ReadonlyMap<number, BonusEntry>): boolean {
    if (!e.bonusIds.some((b) => bonuses.get(b)?.item_conversion != null)) return false;
    // только предметы текущего сезона (у прошлого сезона свой флаг катализатора)
    const season = this.config.get().season;
    const t = decodeTrack(e.bonusIds, bonuses);
    if (t?.seasonId != null && season.seasonId != null) return t.seasonId === season.seasonId;
    const srcs = this.staticData.itemSources(e.itemId);
    return srcs.some((s) => season.raidInstanceIds.includes(s.instanceId) || season.dungeonInstanceIds.includes(s.instanceId));
  }

  /** Прогресс тира персонажа по надетому. */
  progress(c: CharacterRow, sets = this.seasonTierSets()): {
    setId: number | null; pieces: number; owned: string[]; missing: string[]; catalyzable: string[]; itemsBySlot: Map<string, number>;
  } {
    const eq = this.chars.equipment(c.id);
    const bonuses = this.staticData.getBonuses();
    // набор класса
    let setId: number | null = null;
    let items = new Map<string, number>();
    for (const [id, s] of sets) if (s.classId === c.classId) { setId = id; items = s.items; break; }
    // если по классу не нашли — по надетым предметам
    if (setId == null) for (const e of eq) if (e.setId && sets.has(e.setId)) { setId = e.setId; items = sets.get(e.setId)!.items; break; }
    const owned: string[] = [];
    const catalyzable: string[] = [];
    for (const slot of TIER_SLOTS) {
      const e = eq.find((x) => x.slot === slot);
      if (e && setId != null && e.setId === setId) owned.push(slot);
      else if (e && this.isCatalyzable(e, bonuses)) catalyzable.push(slot);
    }
    const missing = TIER_SLOTS.filter((s) => !owned.includes(s));
    return { setId, pieces: owned.length, owned, missing, catalyzable, itemsBySlot: items };
  }

  private latestTierSim(characterId: number): { pieces: number | null; val2: number | null; val4: number | null; at: number | null } {
    const r = this.db.conn.prepare("SELECT tier_pieces, tier2_pct, tier4_pct, finished_at FROM sim_runs WHERE character_id = ? AND ok = 1 AND tier4_pct IS NOT NULL ORDER BY id DESC LIMIT 1").get(characterId) as any;
    return r ? { pieces: r.tier_pieces, val2: r.tier2_pct, val4: r.tier4_pct, at: r.finished_at } : { pieces: null, val2: null, val4: null, at: null };
  }

  /** Приоритет: ценность 4pc × близость (1 часть до 4pc → 1.0, 2 → 0.6, 3+ → 0.3; есть 4pc → 0). */
  static priority(val4: number | null, pieces: number): number | null {
    if (val4 == null) return null;
    if (pieces >= 4) return 0;
    const need = 4 - pieces;
    const k = need <= 1 ? 1 : need === 2 ? 0.6 : 0.3;
    return Math.round(val4 * k * 100) / 100;
  }

  rows(): TierRow[] {
    const sets = this.seasonTierSets();
    const tokens = this.tokens();
    const tokenByItem = new Map<number, typeof tokens>();
    for (const t of tokens) for (const id of t.contains) tokenByItem.set(id, [...(tokenByItem.get(id) ?? []), t]);
    const out: TierRow[] = [];
    for (const c of this.chars.listRaiders()) {
      const p = this.progress(c, sets);
      const sim = this.latestTierSim(c.id);
      const won = this.bis.historyProvider ? undefined : undefined;
      void won;
      const missingTokens = p.missing.map((slot) => {
        const itemId = p.itemsBySlot.get(slot) ?? null;
        const toks = itemId ? tokenByItem.get(itemId) ?? [] : [];
        return { slot, itemId, tokens: toks.map((t) => ({ tokenId: t.id, name: t.nameRu ?? t.name, encounterName: t.encounterName })) };
      });
      out.push({
        characterId: c.id,
        name: c.name,
        realmName: c.realmName,
        classId: c.classId,
        specId: c.activeSpecId,
        setId: p.setId,
        pieces: p.pieces,
        owned: p.owned,
        missing: p.missing,
        catalyzable: p.catalyzable,
        val2: sim.val2,
        val4: sim.val4,
        simAt: sim.at,
        toFour: Math.max(0, 4 - p.pieces),
        priority: TierService.priority(sim.val4, p.pieces),
        missingTokens,
        className: CLASS_IDS[c.classId as keyof typeof CLASS_IDS] ?? String(c.classId),
      });
    }
    out.sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || (b.val4 ?? -1) - (a.val4 ?? -1));
    return out;
  }

  /** Токены: кому подходит и что даёт (по симу тир-предмета из токена). Один проход по ростеру. */
  tokenViews(rows = this.rows()): TierTokenView[] {
    const tokens = this.tokens();
    const byChar = new Map(rows.map((r) => [r.characterId, r]));
    const views = this.chars
      .listRaiders()
      .map((c) => ({ c, view: this.bis.characterBis(c) }))
      .filter((x): x is { c: CharacterRow; view: NonNullable<ReturnType<BisService["characterBis"]>> } => !!x.view);
    const order: Record<string, number> = { no: 0, catalyst: 1, lower: 2, yes: 3 };
    const out: TierTokenView[] = [];
    for (const t of tokens) {
      const targets = new Set<number>([t.id, ...t.contains]);
      const list: TierTokenView["wanters"] = [];
      for (const { c, view } of views) {
        const row = byChar.get(c.id);
        if (!row) continue;
        let bestEntry: { slot: string; obtained: TierTokenView["wanters"][number]["obtained"]; piecePct: number | null; rank: number } | null = null;
        for (const s of view.slots) {
          for (const e of s.entries) {
            if (!targets.has(e.itemId)) continue;
            const simc = e.sources.find((x) => x.source === "simc" && (x.meta as any)?.tokenId === t.id);
            const pct = simc?.score ?? null;
            if (!bestEntry || (pct ?? -Infinity) > (bestEntry.piecePct ?? -Infinity)) bestEntry = { slot: s.slot, obtained: e.obtained, piecePct: pct, rank: e.rank };
          }
        }
        if (!bestEntry) continue;
        const next = row.pieces + 1;
        const closes = next === 2 ? 2 : next === 4 ? 4 : next === 5 ? 5 : 0;
        list.push({ characterId: c.id, name: c.name, classId: c.classId, specId: view.specId, slot: bestEntry.slot, obtained: bestEntry.obtained, pieces: row.pieces, closes, piecePct: bestEntry.piecePct, val4: row.val4, priority: row.priority });
      }
      list.sort((a, b) => order[a.obtained]! - order[b.obtained]! || (b.piecePct ?? -1) - (a.piecePct ?? -1) || (b.priority ?? -1) - (a.priority ?? -1));
      out.push({ tokenId: t.id, name: t.nameRu ?? t.name, icon: t.icon, instanceName: t.instanceName, encounterName: t.encounterName, wanters: list });
    }
    return out;
  }
}

export type { ItemRow };
