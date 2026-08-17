import { CLASS_IDS, SPEC_BY_ID, type CharacterRow, type EquipmentRow } from "@easyroster/core";

/** Генерация simc-профиля персонажа из данных БД (без обращения к армори). */

const SIMC_CLASS: Record<string, string> = {
  WARRIOR: "warrior", PALADIN: "paladin", HUNTER: "hunter", ROGUE: "rogue", PRIEST: "priest", DEATHKNIGHT: "deathknight",
  SHAMAN: "shaman", MAGE: "mage", WARLOCK: "warlock", MONK: "monk", DRUID: "druid", DEMONHUNTER: "demonhunter", EVOKER: "evoker",
};

/** playable_race id → simc race */
const SIMC_RACE: Record<number, string> = {
  1: "human", 2: "orc", 3: "dwarf", 4: "night_elf", 5: "undead", 6: "tauren", 7: "gnome", 8: "troll", 9: "goblin", 10: "blood_elf",
  11: "draenei", 22: "worgen", 24: "pandaren", 25: "pandaren", 26: "pandaren", 27: "nightborne", 28: "highmountain_tauren",
  29: "void_elf", 30: "lightforged_draenei", 31: "zandalari_troll", 32: "kul_tiran", 34: "dark_iron_dwarf", 35: "vulpera",
  36: "mag_har_orc", 37: "mechagnome", 52: "dracthyr", 70: "dracthyr", 84: "earthen_dwarf", 85: "earthen_dwarf", 86: "haranir",
};

/** Blizzard slot.type → simc slot */
const SIMC_SLOT: Record<string, string> = {
  HEAD: "head", NECK: "neck", SHOULDER: "shoulder", BACK: "back", CHEST: "chest", WRIST: "wrist", HANDS: "hands", WAIST: "waist",
  LEGS: "legs", FEET: "feet", FINGER_1: "finger1", FINGER_2: "finger2", TRINKET_1: "trinket1", TRINKET_2: "trinket2",
  MAIN_HAND: "main_hand", OFF_HAND: "off_hand",
};

export function simcSpecName(specId: number): string | null {
  const s = SPEC_BY_ID.get(specId);
  if (!s) return null;
  return s.name.toLowerCase().replace(/\s+/g, "_");
}

export interface ProfileInput {
  character: CharacterRow;
  specId: number;
  equipment: EquipmentRow[];
  role: "attack" | "tank";
}

export function buildSimcProfile(input: ProfileInput): { text: string; slots: string[] } {
  const { character, specId, equipment } = input;
  const classFile = CLASS_IDS[character.classId as keyof typeof CLASS_IDS];
  const cls = classFile ? SIMC_CLASS[classFile] : null;
  const spec = simcSpecName(specId);
  if (!cls || !spec) throw new Error(`Неизвестный класс/спека ${character.classId}/${specId}`);
  const name = character.name.replace(/[^\p{L}\p{N}_]/gu, "_");
  const lines: string[] = [];
  lines.push(`${cls}="${name}"`);
  lines.push(`level=${character.level || 90}`);
  lines.push(`race=${SIMC_RACE[character.raceId ?? 0] ?? "human"}`);
  lines.push(`spec=${spec}`);
  lines.push(`role=${input.role}`);
  if (character.talentLoadoutCode) lines.push(`talents=${character.talentLoadoutCode}`);
  lines.push("");
  const slots: string[] = [];
  for (const e of equipment) {
    const slot = SIMC_SLOT[e.slot];
    if (!slot) continue;
    const parts = [`id=${e.itemId}`];
    if (e.bonusIds.length) parts.push(`bonus_id=${e.bonusIds.join("/")}`);
    if (e.enchantId) parts.push(`enchant_id=${e.enchantId}`);
    if (e.gems.length) parts.push(`gem_id=${e.gems.map((g) => g.itemId).join("/")}`);
    lines.push(`${slot}=,${parts.join(",")}`);
    slots.push(slot);
  }
  return { text: lines.join("\n") + "\n", slots };
}
