import { INVENTORY_TYPE_TO_SLOT, SPEC_BY_ID, itemUsableBySpec, type BonusEntry, type ItemRow } from "@easyroster/core";

/**
 * Кандидаты для профильсетов: лут рейдов/подземелий сезона, пригодный спеке,
 * на выбранных треках; тир-токены разворачиваются в предмет тира класса.
 */

export interface SimCandidate {
  name: string; // имя профильсета: inst/enc/item/slot/track/token
  itemId: number;
  tokenId: number | null;
  instanceId: number;
  encounterId: number;
  simcSlot: string; // head … finger1/finger2, trinket1/trinket2, main_hand, off_hand
  canonSlot: string; // HEAD … FINGER, TRINKET, MAIN_HAND, OFF_HAND
  track: string;
  bonusId: number;
  ilvl: number | null;
  /** двуручное оружие — при подстановке нужно очистить off_hand */
  twoHand: boolean;
}

const CANON_TO_SIMC: Record<string, string[]> = {
  HEAD: ["head"], NECK: ["neck"], SHOULDER: ["shoulder"], BACK: ["back"], CHEST: ["chest"], WRIST: ["wrist"], HANDS: ["hands"],
  WAIST: ["waist"], LEGS: ["legs"], FEET: ["feet"], FINGER: ["finger1", "finger2"], TRINKET: ["trinket1", "trinket2"],
  MAIN_HAND: ["main_hand"], TWO_HAND: ["main_hand"], WEAPON: ["main_hand"], RANGED: ["main_hand"], OFF_HAND: ["off_hand"],
};

/** bonusID первого ранга трека для сезона (из Raidbots bonuses.json). */
export function trackBonusIds(bonuses: ReadonlyMap<number, BonusEntry>, seasonId: number | null): Map<string, { bonusId: number; ilvl: number | null }> {
  const out = new Map<string, { bonusId: number; ilvl: number | null }>();
  for (const b of bonuses.values()) {
    const u = b.upgrade;
    if (!u || u.level !== 1) continue;
    // строго текущий сезон (записи без seasonId — будущие/тестовые треки с завышенным ilvl)
    if (seasonId != null ? u.seasonId !== seasonId : u.seasonId == null) continue;
    const prev = out.get(u.name);
    if (!prev || (u.itemLevel ?? 0) > (prev.ilvl ?? 0)) out.set(u.name, { bonusId: b.id, ilvl: u.itemLevel ?? b.itemLevel?.amount ?? null });
  }
  return out;
}

export interface CandidateInput {
  specId: number;
  classId: number;
  raidItems: Array<ItemRow & { instanceId: number; encounterId: number }>;
  dungeonItems: Array<ItemRow & { instanceId: number; encounterId: number }>;
  raidTracks: string[];
  dungeonTracks: string[];
  tracks: Map<string, { bonusId: number; ilvl: number | null }>;
  /** разрешение содержимого токена: itemId → ItemRow */
  resolveItem: (id: number) => ItemRow | undefined;
  /** есть ли у персонажа off-hand слот (для щитов/держалок) — если нет, off_hand кандидаты пропускаем */
  hasOffHand: boolean;
  /** двуручник ли сейчас в правой руке */
  usesTwoHand: boolean;
}

export function buildSimCandidates(input: CandidateInput): SimCandidate[] {
  const spec = SPEC_BY_ID.get(input.specId);
  if (!spec) return [];
  const out: SimCandidate[] = [];
  const seen = new Set<string>();

  const usable = (it: ItemRow): boolean =>
    it.itemClass != null &&
    it.inventoryType != null &&
    itemUsableBySpec(
      { id: it.id, itemClass: it.itemClass, itemSubClass: it.itemSubClass ?? 0, inventoryType: it.inventoryType, stats: it.stats, specs: it.specs ?? undefined, allowableClasses: it.allowableClasses ?? undefined },
      input.specId,
    );

  const push = (it: ItemRow, tokenId: number | null, instanceId: number, encounterId: number, trackNames: string[]) => {
    const canon = it.inventoryType != null ? INVENTORY_TYPE_TO_SLOT[it.inventoryType] : null;
    if (!canon) return;
    const simcSlots = CANON_TO_SIMC[canon];
    if (!simcSlots) return;
    for (const track of trackNames) {
      const t = input.tracks.get(track);
      if (!t) continue;
      for (const simcSlot of simcSlots) {
        if (simcSlot === "off_hand" && !input.hasOffHand) continue;
        const key = `${it.id}|${simcSlot}|${t.bonusId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: `${instanceId}/${encounterId}/${it.id}/${simcSlot}/${track}/${tokenId ?? 0}`,
          itemId: it.id, tokenId, instanceId, encounterId, simcSlot, canonSlot: canon, track, bonusId: t.bonusId, ilvl: t.ilvl,
          twoHand: canon === "TWO_HAND" || (canon === "RANGED" && it.itemClass === 2),
        });
      }
    }
  };

  const handle = (list: CandidateInput["raidItems"], trackNames: string[]) => {
    for (const it of list) {
      if (it.contains && it.contains.length) {
        // тир-токен: предметы тира, пригодные классу/спеке
        for (const innerId of it.contains) {
          const inner = input.resolveItem(innerId);
          if (!inner) continue;
          if (inner.allowableClasses && !inner.allowableClasses.includes(input.classId)) continue;
          if (!usable(inner)) continue;
          push(inner, it.id, it.instanceId, it.encounterId, trackNames);
        }
        continue;
      }
      if (!usable(it)) continue;
      push(it, null, it.instanceId, it.encounterId, trackNames);
    }
  };

  handle(input.raidItems, input.raidTracks);
  handle(input.dungeonItems, input.dungeonTracks);
  return out;
}

/** Строка профильсета для simc. */
export function profilesetLine(c: SimCandidate, opts: { extraBonus?: number[]; clearOffHand?: boolean } = {}): string {
  const bonus = [c.bonusId, ...(opts.extraBonus ?? [])].join("/");
  let line = `profileset."${c.name}"+=${c.simcSlot}=,id=${c.itemId},bonus_id=${bonus}`;
  if (c.twoHand && opts.clearOffHand) line += `
profileset."${c.name}"+=off_hand=`;
  return line;
}
