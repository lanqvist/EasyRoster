import {
  SLOT_TO_EQUIP_SLOTS,
  decodeTrack,
  type BisCandidateRow,
  type BisCharacterView,
  type BisEntry,
  type BisSlotView,
  type BonusEntry,
  type EquipmentRow,
  type ItemRow,
  type ObtainedStatus,
  type BisSource,
  type SourceKind,
  type RaidDifficulty,
  type AltRef,
  type BisAlternatives,
  RAID_DIFFICULTY_TRACK,
  isSimSource,
} from "@easyroster/core";
import type { ManualRule } from "./repo.js";

/** Чистая логика объединения кандидатов и сравнения с экипировкой (тестируется без БД). */

export interface EngineInput {
  characterId: number;
  specId: number;
  candidates: BisCandidateRow[];
  manual: ManualRule[];
  equipment: EquipmentRow[];
  items: Map<number, ItemRow>;
  itemSources: (itemId: number) => Array<{ instanceId: number; instanceName: string; encounterId: number; encounterName: string }>;
  bonuses: ReadonlyMap<number, BonusEntry>;
  weights: { icyveins: number; wcl: number; droptimizer: number };
  perSlot: number;
  simMaxAgeMs: number;
  now: number;
  /** предметы, полученные по истории RCLootCouncil: itemId → ts */
  won?: Map<number, number>;
  /** тип источника инстанса (рейд сезона / M+ / мировой босс) */
  sourceKindOf?: (instanceId: number) => SourceKind;
  /** выбранная сложность рейда → трек */
  raidDifficulty?: RaidDifficulty;
  /** трек → ilvl (сезон) */
  trackIlvl?: Map<string, number | null>;
  /** трек M+ дропа (по умолчанию Hero) */
  dungeonTrack?: string;
}

function trackNameOf(bonusIds: number[], bonuses: ReadonlyMap<number, BonusEntry>): string | null {
  return decodeTrack(bonusIds, bonuses)?.name ?? null;
}

/** Классификация записи по источникам дропа и заметкам гайдов. */
function classifyKind(
  drops: Array<{ instanceId: number; kind: SourceKind }>,
  originalItemId: number | null,
  notes: Array<string | null>,
): SourceKind {
  if (originalItemId) return "catalyst";
  const kinds = new Set(drops.map((d) => d.kind));
  if (kinds.has("raid")) return "raid";
  if (kinds.has("mplus")) return "mplus";
  if (kinds.has("world")) return "world";
  const note = notes.filter(Boolean).join(" ").toLowerCase();
  if (/craft|крафт|profession/.test(note)) return "craft";
  if (/vault|тайник/.test(note)) return "vault";
  if (/catalyst|катализ/.test(note)) return "catalyst";
  return drops.length ? "other" : "other";
}

/** Балл кандидата внутри источника (0..100). */
export function candidateScore(c: BisCandidateRow): number {
  switch (c.source) {
    case "icyveins":
      switch (c.list) {
        case "overall":
          return c.rank <= 2 ? 100 : Math.max(0, 100 - (c.rank - 1) * 10);
        case "tier":
          return 90;
        case "raid":
        case "mplus":
          return c.rank <= 2 ? 70 : Math.max(0, 70 - (c.rank - 1) * 10);
        case "trinkets":
          return Math.max(0, 100 - (c.rank - 1) * 15); // S=100 A=85 B=70 C=55
        default:
          return 50;
      }
    case "wcl":
      return Math.min(100, (c.score ?? 0) * 0.9); // популярность %
    case "droptimizer":
    case "simc":
      return Math.min(100, Math.max(0, (c.score ?? 0) * 20)); // 5 % апгрейда = 100
    case "manual":
      return 100;
    default:
      return 0;
  }
}

function trackLabel(bonusIds: number[], bonuses: ReadonlyMap<number, BonusEntry>, fallback: string | null): string | null {
  const t = decodeTrack(bonusIds, bonuses);
  if (t) return `${t.name} ${t.level}/${t.max}`;
  return fallback;
}

export function buildCharacterBis(input: EngineInput): BisCharacterView {
  const { candidates, manual, equipment, items, bonuses, weights, perSlot } = input;
  const raidTrack = RAID_DIFFICULTY_TRACK[input.raidDifficulty ?? "normal"];
  const dungeonTrack = input.dungeonTrack ?? "Hero";
  const kindOf = input.sourceKindOf ?? (() => "other" as SourceKind);
  const ilvlOf = (t: string | null) => (t ? input.trackIlvl?.get(t) ?? null : null);
  const excluded = new Set(manual.filter((m) => m.action === "exclude").map((m) => `${m.slot}|${m.itemId}`));
  const pinned = new Map(manual.filter((m) => m.action === "pin").map((m) => [`${m.slot}|${m.itemId}`, m]));

  // персональный сим — свежий?
  // предпочитаем свежайший персональный сим одного типа (simc или droptimizer)
  const allSim = candidates.filter((c) => isSimSource(c.source) && c.characterId === input.characterId);
  const newestSource = allSim.length ? allSim.reduce((a, b) => (b.fetchedAt > a.fetchedAt ? b : a)).source : null;
  const simCands = allSim.filter((c) => c.source === newestSource);
  const simFresh = simCands.length > 0 && input.now - Math.max(...simCands.map((c) => c.fetchedAt)) <= input.simMaxAgeMs;

  // группировка по слоту и предмету
  const bySlot = new Map<string, Map<number, { cands: BisCandidateRow[]; bonusIds: number[]; originalItemId: number | null }>>();
  for (const c of candidates) {
    if (isSimSource(c.source) && (!simFresh || c.characterId !== input.characterId || c.source !== newestSource)) continue;
    if (c.characterId !== null && c.characterId !== input.characterId) continue;
    // WCL/IV не различают левое/правое кольцо — используем канонический слот
    const slot = c.slot;
    if (excluded.has(`${slot}|${c.itemId}`)) continue;
    let m = bySlot.get(slot);
    if (!m) bySlot.set(slot, (m = new Map()));
    let e = m.get(c.itemId);
    if (!e) m.set(c.itemId, (e = { cands: [], bonusIds: c.bonusIds, originalItemId: c.originalItemId }));
    e.cands.push(c);
    if (c.originalItemId && !e.originalItemId) e.originalItemId = c.originalItemId;
    if (c.bonusIds.length > e.bonusIds.length) e.bonusIds = c.bonusIds;
  }
  // закреплённые вручную предметы, которых нет в источниках
  for (const [key, rule] of pinned) {
    const [slot, idStr] = key.split("|");
    const itemId = Number(idStr);
    let m = bySlot.get(slot!);
    if (!m) bySlot.set(slot!, (m = new Map()));
    if (!m.has(itemId)) m.set(itemId, { cands: [], bonusIds: [], originalItemId: null });
    void rule;
  }

  const slots: BisSlotView[] = [];
  let coverSlots = 0;
  let coverObtained = 0;
  let coverLower = 0;

  for (const [slot, m] of bySlot) {
    const equipSlots = SLOT_TO_EQUIP_SLOTS[slot] ?? [slot];
    const equipped = equipment.filter((e) => equipSlots.includes(e.slot));

    const entries: BisEntry[] = [];
    for (const [itemId, e] of m) {
      const item = items.get(itemId);
      // взвешенная сумма по источникам: берём лучший балл в каждом источнике
      const bestBySource = new Map<BisSource, number>();
      for (const c of e.cands) {
        const s = candidateScore(c);
        bestBySource.set(c.source, Math.max(bestBySource.get(c.source) ?? 0, s));
      }
      let score = 0;
      for (const [src, s] of bestBySource) {
        const w = src === "icyveins" ? weights.icyveins : src === "wcl" ? weights.wcl : isSimSource(src) ? weights.droptimizer : 1;
        score += s * w;
      }
      if (pinned.has(`${slot}|${itemId}`)) score += 1000;

      const isTier = !!item?.itemSetId && (item.contains == null);
      const { obtained, detail } = obtainedStatus({ itemId, item, originalItemId: e.originalItemId, equipped, bonuses, won: input.won });

      const drops = new Map<string, BisEntry["drops"][number]>();
      for (const d of input.itemSources(itemId)) drops.set(`${d.instanceId}|${d.encounterId}`, { ...d, kind: kindOf(d.instanceId) });
      if (e.originalItemId) for (const d of input.itemSources(e.originalItemId)) drops.set(`${d.instanceId}|${d.encounterId}`, { ...d, kind: kindOf(d.instanceId) });
      const dropList = [...drops.values()];
      const sourceKind = classifyKind(dropList, e.originalItemId, e.cands.map((c) => c.sourceNote));
      const bisTrackName = trackNameOf(e.bonusIds, bonuses);
      const dropTrackName = sourceKind === "raid" || sourceKind === "catalyst" || sourceKind === "world" ? raidTrack : sourceKind === "mplus" ? dungeonTrack : sourceKind === "vault" ? "Myth" : bisTrackName;
      // сим по трекам
      const simByTrack: Record<string, number> = {};
      let simBest: number | null = null;
      for (const c of e.cands) {
        if (!isSimSource(c.source) || c.score == null) continue;
        const tr = (c.meta as { track?: string } | null)?.track;
        if (tr) simByTrack[tr] = Math.max(simByTrack[tr] ?? -Infinity, c.score);
        simBest = Math.max(simBest ?? -Infinity, c.score);
      }
      const hasSimTracks = Object.keys(simByTrack).length > 0;
      const simSelected =
        simBest == null
          ? null
          : hasSimTracks && dropTrackName && simByTrack[dropTrackName] != null
            ? { track: dropTrackName, pct: simByTrack[dropTrackName]! }
            : { track: hasSimTracks ? (Object.entries(simByTrack).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) : null, pct: simBest };
      const eqBest = equipped.length
        ? equipped.reduce((a, b) => ((b.ilvl ?? 0) > (a.ilvl ?? 0) ? b : a))
        : null;

      entries.push({
        slot,
        rank: 0,
        itemId,
        itemName: item?.name ?? e.cands.find((c) => c.itemName)?.itemName ?? `#${itemId}`,
        itemNameRu: item?.nameRu ?? null,
        icon: item?.icon ?? null,
        quality: item?.quality ?? null,
        bonusIds: e.bonusIds,
        originalItemId: e.originalItemId,
        score: Math.round(score * 10) / 10,
        sources: e.cands.map((c) => ({ source: c.source, list: c.list, rank: c.rank, score: c.score, note: c.sourceNote, meta: c.meta ?? null })),
        drops: dropList,
        sourceKind,
        bisTrack: bisTrackName ? { name: bisTrackName, ilvl: ilvlOf(bisTrackName) } : null,
        dropTrack: dropTrackName ? { name: dropTrackName, ilvl: ilvlOf(dropTrackName) } : null,
        simByTrack: hasSimTracks ? simByTrack : null,
        simSelected,
        equippedBest: eqBest ? { ilvl: eqBest.ilvl, track: trackNameOf(eqBest.bonusIds, bonuses) ?? eqBest.trackName } : null,
        alternatives: null,
        obtained,
        obtainedDetail: detail,
        isTier,
      });
    }
    entries.sort((a, b) => b.score - a.score || a.itemName.localeCompare(b.itemName));
    entries.forEach((en, i) => (en.rank = i + 1));
    computeAlternatives(entries);
    const top = entries.slice(0, perSlot);

    // покрытие: парные слоты — первые 2 записи, остальные — 1
    const need = slot === "FINGER" || slot === "TRINKET" ? 2 : 1;
    const best = entries.slice(0, need);
    coverSlots += best.length;
    for (const b of best) {
      if (b.obtained === "yes") coverObtained++;
      else if (b.obtained === "lower" || b.obtained === "catalyst") coverLower++;
    }

    slots.push({
      slot,
      entries: top,
      equipped: equipped.map((eq) => ({
        itemId: eq.itemId,
        itemName: eq.itemName,
        icon: items.get(eq.itemId)?.icon ?? null,
        ilvl: eq.ilvl,
        track: trackLabel(eq.bonusIds, bonuses, eq.trackName),
        setId: eq.setId,
      })),
    });
  }

  const ORDER = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET", "FINGER", "TRINKET", "MAIN_HAND", "OFF_HAND", "WEAPON", "TWO_HAND"];
  slots.sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot));

  const sourcesUsed = new Map<BisSource, { fetchedAt: number | null; count: number }>();
  for (const c of candidates) {
    if (isSimSource(c.source) && (!simFresh || c.source !== newestSource)) continue;
    const s = sourcesUsed.get(c.source) ?? { fetchedAt: null, count: 0 };
    s.count++;
    s.fetchedAt = Math.max(s.fetchedAt ?? 0, c.fetchedAt);
    sourcesUsed.set(c.source, s);
  }

  return {
    characterId: input.characterId,
    specId: input.specId,
    slots,
    coverage: { slots: coverSlots, obtained: coverObtained, lower: coverLower, pct: coverSlots ? Math.round((coverObtained / coverSlots) * 100) : 0 },
    sourcesUsed: [...sourcesUsed.entries()].map(([source, s]) => ({ source, ...s })),
    personalSim: simFresh ? { fetchedAt: Math.max(...simCands.map((c) => c.fetchedAt)), label: newestSource === "simc" ? "SimC (авто)" : (simCands[0]?.sourceNote ?? "Droptimizer") } : null,
  };
}

/** Альтернативы по слоту: другой источник (нет общего босса), фармабельные — M+/крафт. */
export function computeAlternatives(entries: BisEntry[]): void {
  const encSet = (e: BisEntry) => new Set(e.drops.map((d) => `${d.instanceId}|${d.encounterId}`));
  const toRef = (o: BisEntry): AltRef => ({
    itemId: o.itemId,
    name: o.itemNameRu ?? o.itemName,
    pct: o.simSelected?.pct ?? 0,
    kind: o.sourceKind,
    sourceName: o.drops[0]?.encounterName ?? o.sources[0]?.note ?? "",
    icon: o.icon,
    quality: o.quality,
    bonusIds: o.bonusIds,
  });
  for (const e of entries) {
    const mine = encSet(e);
    const others = entries.filter((o) => o !== e && o.itemId !== e.itemId && ![...encSet(o)].some((k) => mine.has(k)));
    if (e.simSelected) {
      const withSim = others.filter((o) => o.simSelected);
      const best = withSim.reduce<BisEntry | null>((a, o) => (!a || o.simSelected!.pct > a.simSelected!.pct ? o : a), null);
      const farm = withSim.filter((o) => o.sourceKind === "mplus" || o.sourceKind === "craft").reduce<BisEntry | null>((a, o) => (!a || o.simSelected!.pct > a.simSelected!.pct ? o : a), null);
      const alt: BisAlternatives = {
        best: best ? toRef(best) : null,
        farmable: farm ? toRef(farm) : null,
        gap: Math.round((e.simSelected.pct - Math.max(0, farm?.simSelected?.pct ?? 0)) * 100) / 100,
        count: withSim.filter((o) => o.simSelected!.pct >= e.simSelected!.pct * 0.95 && o.simSelected!.pct > 0).length,
      };
      e.alternatives = alt;
    } else {
      // без сима — по баллу объединения
      const best = others.reduce<BisEntry | null>((a, o) => (!a || o.score > a.score ? o : a), null);
      const farm = others.filter((o) => o.sourceKind === "mplus" || o.sourceKind === "craft").reduce<BisEntry | null>((a, o) => (!a || o.score > a.score ? o : a), null);
      e.alternatives = {
        best: best ? { ...toRef(best), pct: best.score } : null,
        farmable: farm ? { ...toRef(farm), pct: farm.score } : null,
        gap: null,
        count: others.filter((o) => o.score >= e.score * 0.95).length,
      };
    }
  }
}

export function obtainedStatus(args: {
  itemId: number;
  item: ItemRow | undefined;
  originalItemId: number | null;
  equipped: EquipmentRow[];
  bonuses: ReadonlyMap<number, BonusEntry>;
  won?: Map<number, number>;
}): { obtained: ObtainedStatus; detail: string | null } {
  const { itemId, item, originalItemId, equipped, bonuses, won } = args;
  const same = equipped.find((e) => e.itemId === itemId);
  const bySet = !same && item?.itemSetId ? equipped.find((e) => e.setId === item.itemSetId && sameSlotFamily(e, item)) : undefined;
  const hit = same ?? bySet;
  if (hit) {
    const t = decodeTrack(hit.bonusIds, bonuses);
    const label = t ? `${t.name} ${t.level}/${t.max}` : hit.trackName;
    if (t && t.name !== "Myth") return { obtained: "lower", detail: label ? `есть, ${label} (ilvl ${hit.ilvl ?? "?"})` : null };
    return { obtained: "yes", detail: label ? `${label} (ilvl ${hit.ilvl ?? "?"})` : hit.ilvl ? `ilvl ${hit.ilvl}` : null };
  }
  if (originalItemId && equipped.some((e) => e.itemId === originalItemId)) {
    return { obtained: "catalyst", detail: "надет рейдовый предмет — нужен Катализатор" };
  }
  // по истории лута RCLootCouncil (профиль в API обновляется только после логаута)
  if (won) {
    const ts = won.get(itemId);
    if (ts !== undefined) return { obtained: "yes", detail: `получен по истории RCLC${ts ? " " + new Date(ts).toLocaleDateString("ru-RU") : ""}` };
    if (originalItemId && won.has(originalItemId)) return { obtained: "catalyst", detail: "получен рейдовый предмет (история RCLC) — нужен Катализатор" };
  }
  return { obtained: "no", detail: null };
}

function sameSlotFamily(e: EquipmentRow, item: ItemRow): boolean {
  if (!item.slot) return true;
  const fam = SLOT_TO_EQUIP_SLOTS[item.slot] ?? [item.slot];
  return fam.includes(e.slot);
}
