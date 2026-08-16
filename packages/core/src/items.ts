/** Справочники предметов: типы инвентаря, слоты, классы брони/оружия, треки апгрейда. */

import { SPEC_BY_ID, type ClassId } from "./wow.js";

/** Enum.InventoryType (Blizzard) → канонический слот EasyRoster. */
export const INVENTORY_TYPE_TO_SLOT: Record<number, string> = {
  1: "HEAD",
  2: "NECK",
  3: "SHOULDER",
  4: "SHIRT",
  5: "CHEST",
  6: "WAIST",
  7: "LEGS",
  8: "FEET",
  9: "WRIST",
  10: "HANDS",
  11: "FINGER",
  12: "TRINKET",
  13: "WEAPON", // одноручное
  14: "OFF_HAND", // щит
  15: "RANGED",
  16: "BACK",
  17: "TWO_HAND",
  19: "TABARD",
  20: "CHEST", // robe
  21: "MAIN_HAND",
  22: "OFF_HAND",
  23: "OFF_HAND", // holdable
  25: "RANGED", // thrown
  26: "RANGED", // ranged right (guns/bows/xbows/wands)
  28: "RELIC",
};

/** Слот предмета → слоты экипировки, которые он может занять (Blizzard slot.type). */
export const SLOT_TO_EQUIP_SLOTS: Record<string, string[]> = {
  HEAD: ["HEAD"],
  NECK: ["NECK"],
  SHOULDER: ["SHOULDER"],
  BACK: ["BACK"],
  CHEST: ["CHEST"],
  WRIST: ["WRIST"],
  HANDS: ["HANDS"],
  WAIST: ["WAIST"],
  LEGS: ["LEGS"],
  FEET: ["FEET"],
  FINGER: ["FINGER_1", "FINGER_2"],
  TRINKET: ["TRINKET_1", "TRINKET_2"],
  WEAPON: ["MAIN_HAND", "OFF_HAND"],
  MAIN_HAND: ["MAIN_HAND"],
  OFF_HAND: ["OFF_HAND"],
  TWO_HAND: ["MAIN_HAND"],
  RANGED: ["MAIN_HAND"],
  SHIRT: ["SHIRT"],
  TABARD: ["TABARD"],
};

export const SLOT_NAMES_RU: Record<string, string> = {
  HEAD: "Голова",
  NECK: "Шея",
  SHOULDER: "Плечи",
  BACK: "Плащ",
  CHEST: "Грудь",
  WRIST: "Запястья",
  HANDS: "Кисти рук",
  WAIST: "Пояс",
  LEGS: "Ноги",
  FEET: "Ступни",
  FINGER: "Кольцо",
  TRINKET: "Аксессуар",
  WEAPON: "Оружие (1р)",
  MAIN_HAND: "Правая рука",
  OFF_HAND: "Левая рука",
  TWO_HAND: "Двуручное",
  RANGED: "Дальнобойное",
  SHIRT: "Рубашка",
  TABARD: "Накидка",
  RELIC: "Реликвия",
};

/** Порядок слотов для BiS-листа. */
export const BIS_SLOT_ORDER = [
  "HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET",
  "FINGER", "TRINKET", "MAIN_HAND", "OFF_HAND",
] as const;

/** Item class/subclass (ItemClass 2 = оружие, 4 = броня). */
export const ARMOR_SUBCLASS = { MISC: 0, CLOTH: 1, LEATHER: 2, MAIL: 3, PLATE: 4, COSMETIC: 5, SHIELD: 6 } as const;

export const ARMOR_SUBCLASS_NAMES_RU: Record<number, string> = {
  0: "Разное",
  1: "Ткань",
  2: "Кожа",
  3: "Кольчуга",
  4: "Латы",
  5: "Косметика",
  6: "Щит",
};

export const WEAPON_SUBCLASS_NAMES_RU: Record<number, string> = {
  0: "Топор (1р)",
  1: "Топор (2р)",
  2: "Лук",
  3: "Ружьё",
  4: "Дробящее (1р)",
  5: "Дробящее (2р)",
  6: "Древковое",
  7: "Меч (1р)",
  8: "Меч (2р)",
  9: "Боевая глефа",
  10: "Посох",
  13: "Кистевое",
  14: "Разное",
  15: "Кинжал",
  18: "Арбалет",
  19: "Жезл",
  20: "Удочка",
};

/** Тип брони класса. */
export const CLASS_ARMOR: Record<ClassId, number> = {
  1: ARMOR_SUBCLASS.PLATE,
  2: ARMOR_SUBCLASS.PLATE,
  3: ARMOR_SUBCLASS.MAIL,
  4: ARMOR_SUBCLASS.LEATHER,
  5: ARMOR_SUBCLASS.CLOTH,
  6: ARMOR_SUBCLASS.PLATE,
  7: ARMOR_SUBCLASS.MAIL,
  8: ARMOR_SUBCLASS.CLOTH,
  9: ARMOR_SUBCLASS.CLOTH,
  10: ARMOR_SUBCLASS.LEATHER,
  11: ARMOR_SUBCLASS.LEATHER,
  12: ARMOR_SUBCLASS.LEATHER,
  13: ARMOR_SUBCLASS.MAIL,
};

/** Основная характеристика спеки: 3 = ловкость, 4 = сила, 5 = интеллект. */
export type PrimaryStat = 3 | 4 | 5;
export const SPEC_PRIMARY_STAT: Record<number, PrimaryStat> = {
  250: 4, 251: 4, 252: 4,
  577: 3, 581: 3, 1480: 3,
  102: 5, 103: 3, 104: 3, 105: 5,
  1467: 5, 1468: 5, 1473: 5,
  253: 3, 254: 3, 255: 3,
  62: 5, 63: 5, 64: 5,
  268: 3, 270: 5, 269: 3,
  65: 5, 66: 4, 70: 4,
  256: 5, 257: 5, 258: 5,
  259: 3, 260: 3, 261: 3,
  262: 5, 263: 3, 264: 5,
  265: 5, 266: 5, 267: 5,
  71: 4, 72: 4, 73: 4,
};

/** Stat id → входит ли основная характеристика (71–74 — комбинированные). */
export function statContainsPrimary(statId: number, primary: PrimaryStat): boolean {
  if (statId === primary) return true;
  // 71 = agi/str/int, 72 = agi/str, 73 = agi/int, 74 = str/int
  if (statId === 71) return true;
  if (statId === 72) return primary === 3 || primary === 4;
  if (statId === 73) return primary === 3 || primary === 5;
  if (statId === 74) return primary === 4 || primary === 5;
  return false;
}

/** Разрешённые подклассы оружия по спеке (лут-элигибилити, приближённо как в игре). */
const W = {
  AXE1: 0, AXE2: 1, BOW: 2, GUN: 3, MACE1: 4, MACE2: 5, POLEARM: 6, SWORD1: 7, SWORD2: 8, GLAIVE: 9,
  STAFF: 10, FIST: 13, MISC: 14, DAGGER: 15, XBOW: 18, WAND: 19,
} as const;

export const SPEC_WEAPONS: Record<number, number[]> = {
  // DK
  250: [W.AXE2, W.MACE2, W.SWORD2, W.POLEARM],
  251: [W.AXE1, W.MACE1, W.SWORD1, W.AXE2, W.MACE2, W.SWORD2],
  252: [W.AXE2, W.MACE2, W.SWORD2, W.POLEARM],
  // DH
  577: [W.GLAIVE, W.SWORD1, W.AXE1, W.FIST],
  581: [W.GLAIVE, W.SWORD1, W.AXE1, W.FIST],
  1480: [W.GLAIVE, W.SWORD1, W.AXE1, W.FIST],
  // Druid
  102: [W.STAFF, W.MACE1, W.MACE2, W.DAGGER, W.FIST, W.POLEARM],
  103: [W.STAFF, W.MACE2, W.POLEARM],
  104: [W.STAFF, W.MACE2, W.POLEARM],
  105: [W.STAFF, W.MACE1, W.DAGGER, W.FIST, W.MACE2, W.POLEARM],
  // Evoker
  1467: [W.STAFF, W.MACE1, W.SWORD1, W.DAGGER, W.FIST, W.AXE1, W.AXE2, W.MACE2, W.SWORD2],
  1468: [W.STAFF, W.MACE1, W.SWORD1, W.DAGGER, W.FIST, W.AXE1, W.AXE2, W.MACE2, W.SWORD2],
  1473: [W.STAFF, W.MACE1, W.SWORD1, W.DAGGER, W.FIST, W.AXE1, W.AXE2, W.MACE2, W.SWORD2],
  // Hunter
  253: [W.BOW, W.GUN, W.XBOW],
  254: [W.BOW, W.GUN, W.XBOW],
  255: [W.POLEARM, W.STAFF, W.AXE2, W.SWORD2],
  // Mage
  62: [W.STAFF, W.DAGGER, W.SWORD1, W.WAND],
  63: [W.STAFF, W.DAGGER, W.SWORD1, W.WAND],
  64: [W.STAFF, W.DAGGER, W.SWORD1, W.WAND],
  // Monk
  268: [W.STAFF, W.POLEARM, W.AXE1, W.MACE1, W.SWORD1, W.FIST],
  270: [W.STAFF, W.MACE1, W.SWORD1, W.AXE1, W.FIST, W.POLEARM],
  269: [W.AXE1, W.MACE1, W.SWORD1, W.FIST, W.STAFF, W.POLEARM],
  // Paladin
  65: [W.MACE1, W.SWORD1, W.AXE1, W.MACE2, W.SWORD2, W.AXE2, W.POLEARM],
  66: [W.MACE1, W.SWORD1, W.AXE1],
  70: [W.MACE2, W.SWORD2, W.AXE2, W.POLEARM],
  // Priest
  256: [W.STAFF, W.MACE1, W.DAGGER, W.WAND],
  257: [W.STAFF, W.MACE1, W.DAGGER, W.WAND],
  258: [W.STAFF, W.MACE1, W.DAGGER, W.WAND],
  // Rogue
  259: [W.DAGGER],
  260: [W.SWORD1, W.AXE1, W.MACE1, W.FIST],
  261: [W.DAGGER],
  // Shaman
  262: [W.MACE1, W.AXE1, W.DAGGER, W.FIST, W.STAFF],
  263: [W.MACE1, W.AXE1, W.FIST],
  264: [W.MACE1, W.AXE1, W.DAGGER, W.FIST, W.STAFF],
  // Warlock
  265: [W.STAFF, W.DAGGER, W.SWORD1, W.WAND],
  266: [W.STAFF, W.DAGGER, W.SWORD1, W.WAND],
  267: [W.STAFF, W.DAGGER, W.SWORD1, W.WAND],
  // Warrior
  71: [W.AXE2, W.MACE2, W.SWORD2, W.POLEARM],
  72: [W.AXE1, W.MACE1, W.SWORD1, W.AXE2, W.MACE2, W.SWORD2],
  73: [W.AXE1, W.MACE1, W.SWORD1],
};

/** Может ли спека использовать щит / off-hand. */
export const SPEC_OFFHAND: Record<number, "SHIELD" | "HOLDABLE" | null> = {
  66: "SHIELD", 73: "SHIELD", 262: "SHIELD", 264: "SHIELD", 263: null,
  65: "SHIELD",
  62: "HOLDABLE", 63: "HOLDABLE", 64: "HOLDABLE", 256: "HOLDABLE", 257: "HOLDABLE", 258: "HOLDABLE",
  265: "HOLDABLE", 266: "HOLDABLE", 267: "HOLDABLE", 102: "HOLDABLE", 105: "HOLDABLE", 270: "HOLDABLE",
  1467: "HOLDABLE", 1468: "HOLDABLE", 1473: "HOLDABLE",
};

export interface ItemLike {
  id: number;
  itemClass: number;
  itemSubClass: number;
  inventoryType: number;
  stats?: Array<{ id: number; alloc?: number }>;
  specs?: number[];
  allowableClasses?: number[];
}

/**
 * Пригодна ли вещь спеке (по правилам лут-фильтра, приближённо):
 * 1) явные specs из данных Raidbots — приоритет;
 * 2) allowableClasses;
 * 3) броня — тип брони класса (кроме плаща/шеи/колец/тринкетов), основной стат;
 * 4) оружие — таблица подклассов + основной стат.
 */
export function itemUsableBySpec(item: ItemLike, specId: number): boolean {
  const spec = SPEC_BY_ID.get(specId);
  if (!spec) return false;
  if (item.specs && item.specs.length > 0) return item.specs.includes(specId);
  if (item.allowableClasses && item.allowableClasses.length > 0 && !item.allowableClasses.includes(spec.classId)) return false;

  const primary = SPEC_PRIMARY_STAT[specId];
  const hasPrimaryStat = (item.stats ?? []).some((s) => [3, 4, 5, 71, 72, 73, 74].includes(s.id));
  const primaryOk = !hasPrimaryStat || (item.stats ?? []).some((s) => statContainsPrimary(s.id, primary));

  const slot = INVENTORY_TYPE_TO_SLOT[item.inventoryType];
  if (item.itemClass === 4) {
    if (item.itemSubClass === ARMOR_SUBCLASS.SHIELD) return SPEC_OFFHAND[specId] === "SHIELD" && primaryOk;
    if (slot === "OFF_HAND" && item.itemSubClass === ARMOR_SUBCLASS.MISC) return SPEC_OFFHAND[specId] === "HOLDABLE" && primaryOk;
    if (["BACK", "NECK", "FINGER", "TRINKET"].includes(slot ?? "")) return primaryOk;
    if (item.itemSubClass === ARMOR_SUBCLASS.MISC) return primaryOk;
    return item.itemSubClass === CLASS_ARMOR[spec.classId] && primaryOk;
  }
  if (item.itemClass === 2) {
    const allowed = SPEC_WEAPONS[specId] ?? [];
    return allowed.includes(item.itemSubClass) && primaryOk;
  }
  return primaryOk;
}

export function itemUsableByClass(item: ItemLike, classId: number): boolean {
  return [...SPEC_BY_ID.values()].some((s) => s.classId === classId && itemUsableBySpec(item, s.id));
}

// ------------------------------------------------------------ треки

export interface TrackInfo {
  name: string; // Adventurer | Veteran | Champion | Hero | Myth | Explorer …
  level: number;
  max: number;
  ilvl: number | null;
  seasonId: number | null;
}

export const TRACK_NAMES_RU: Record<string, string> = {
  Explorer: "Исследователь",
  Adventurer: "Искатель приключений",
  Veteran: "Ветеран",
  Champion: "Чемпион",
  Hero: "Герой",
  Myth: "Миф",
};

export const TRACK_ORDER = ["Explorer", "Adventurer", "Veteran", "Champion", "Hero", "Myth"] as const;
export function trackRank(name: string | null | undefined): number {
  const i = TRACK_ORDER.indexOf((name ?? "") as (typeof TRACK_ORDER)[number]);
  return i;
}

/** Midnight Season 1: bonusID → трек/ранг/ilvl (Raidbots убрал upgrade-блоки S1 после 12.1). */
const S1_TRACKS: Array<{ name: string; first: number; ilvls: number[] }> = [
  { name: "Adventurer", first: 12769, ilvls: [220, 224, 227, 230, 233, 237, 240, 243] },
  { name: "Veteran", first: 12777, ilvls: [233, 237, 240, 243, 246, 250, 253, 256] },
  { name: "Champion", first: 12785, ilvls: [246, 250, 253, 256, 259, 263, 266, 269] },
  { name: "Hero", first: 12793, ilvls: [259, 263, 266, 269, 272, 276, 279, 282] },
  { name: "Myth", first: 12801, ilvls: [272, 276, 279, 282, 285, 289, 292, 295] },
];

export const S1_TRACK_BY_BONUS: ReadonlyMap<number, TrackInfo> = (() => {
  const m = new Map<number, TrackInfo>();
  for (const t of S1_TRACKS) {
    t.ilvls.forEach((ilvl, i) => m.set(t.first + i, { name: t.name, level: i + 1, max: 6, ilvl, seasonId: 35 }));
  }
  m.set(13653, { name: "Hero", level: 9, max: 6, ilvl: 285, seasonId: 35 });
  m.set(13654, { name: "Myth", level: 9, max: 6, ilvl: 298, seasonId: 35 });
  return m;
})();

/** Минимальная модель записи Raidbots bonuses.json. */
export interface BonusEntry {
  id: number;
  itemLevel?: { amount: number };
  level?: number;
  quality?: number;
  socket?: number;
  tag?: string;
  upgrade?: { group: number; level: number; max: number; name: string; fullName?: string; seasonId?: number; itemLevel?: number };
  item_conversion?: number;
}

/** Определить трек по bonusID: сначала Raidbots upgrade-блоки, потом таблица S1. */
export function decodeTrack(bonusIds: number[], bonuses: ReadonlyMap<number, BonusEntry> | Record<string, BonusEntry> | null): TrackInfo | null {
  const lookup = (id: number): BonusEntry | undefined =>
    bonuses instanceof Map ? bonuses.get(id) : bonuses ? (bonuses as Record<string, BonusEntry>)[String(id)] : undefined;
  for (const id of bonusIds) {
    const b = lookup(id);
    if (b?.upgrade) {
      return { name: b.upgrade.name, level: b.upgrade.level, max: b.upgrade.max, ilvl: b.upgrade.itemLevel ?? b.itemLevel?.amount ?? null, seasonId: b.upgrade.seasonId ?? null };
    }
  }
  for (const id of bonusIds) {
    const t = S1_TRACK_BY_BONUS.get(id);
    if (t) return t;
  }
  return null;
}

/** Иконка предмета по имени иконки Raidbots/Blizzard. */
export function iconUrl(icon: string | null | undefined, size: "small" | "medium" | "large" = "medium"): string {
  return `https://wow.zamimg.com/images/wow/icons/${size}/${icon || "inv_misc_questionmark"}.jpg`;
}

/** Ссылка на Wowhead с bonus-ами. */
export function wowheadUrl(itemId: number, bonusIds: number[] = [], locale: "ru" | "en" = "ru"): string {
  const base = locale === "ru" ? "https://www.wowhead.com/ru/item=" : "https://www.wowhead.com/item=";
  return `${base}${itemId}${bonusIds.length ? `?bonus=${bonusIds.join(":")}` : ""}`;
}
