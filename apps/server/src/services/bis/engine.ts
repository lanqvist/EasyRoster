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
      for (const d of input.itemSources(itemId)) drops.set(`${d.instanceId}|${d.encounterId}`, d);
      if (e.originalItemId) for (const d of input.itemSources(e.originalItemId)) drops.set(`${d.instanceId}|${d.encounterId}`, d);

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
        drops: [...drops.values()],
        obtained,
        obtainedDetail: detail,
        isTier,
      });
    }
    entries.sort((a, b) => b.score - a.score || a.itemName.localeCompare(b.itemName));
    entries.forEach((en, i) => (en.rank = i + 1));
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
