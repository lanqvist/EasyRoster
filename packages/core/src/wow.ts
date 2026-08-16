/** Справочники WoW, не меняющиеся между сезонами. */

export const CLASS_IDS = {
  1: "WARRIOR",
  2: "PALADIN",
  3: "HUNTER",
  4: "ROGUE",
  5: "PRIEST",
  6: "DEATHKNIGHT",
  7: "SHAMAN",
  8: "MAGE",
  9: "WARLOCK",
  10: "MONK",
  11: "DRUID",
  12: "DEMONHUNTER",
  13: "EVOKER",
} as const;

export type ClassId = keyof typeof CLASS_IDS;
export type ClassFile = (typeof CLASS_IDS)[ClassId];

export const CLASS_NAMES_RU: Record<ClassFile, string> = {
  WARRIOR: "Воин",
  PALADIN: "Паладин",
  HUNTER: "Охотник",
  ROGUE: "Разбойник",
  PRIEST: "Жрец",
  DEATHKNIGHT: "Рыцарь смерти",
  SHAMAN: "Шаман",
  MAGE: "Маг",
  WARLOCK: "Чернокнижник",
  MONK: "Монах",
  DRUID: "Друид",
  DEMONHUNTER: "Охотник на демонов",
  EVOKER: "Пробудитель",
};

/** Цвета классов (как в игре). */
export const CLASS_COLORS: Record<ClassFile, string> = {
  WARRIOR: "#C69B6D",
  PALADIN: "#F48CBA",
  HUNTER: "#AAD372",
  ROGUE: "#FFF468",
  PRIEST: "#FFFFFF",
  DEATHKNIGHT: "#C41E3A",
  SHAMAN: "#0070DD",
  MAGE: "#3FC7EB",
  WARLOCK: "#8788EE",
  MONK: "#00FF98",
  DRUID: "#FF7C0A",
  DEMONHUNTER: "#A330C9",
  EVOKER: "#33937F",
};

export type Role = "TANK" | "HEALER" | "DAMAGER";

export interface SpecInfo {
  id: number;
  classId: ClassId;
  name: string;
  role: Role;
}

/** Спеки Midnight 12.x (включая новую Devourer DH = 1480). */
export const SPECS: SpecInfo[] = [
  { id: 250, classId: 6, name: "Blood", role: "TANK" },
  { id: 251, classId: 6, name: "Frost", role: "DAMAGER" },
  { id: 252, classId: 6, name: "Unholy", role: "DAMAGER" },
  { id: 577, classId: 12, name: "Havoc", role: "DAMAGER" },
  { id: 581, classId: 12, name: "Vengeance", role: "TANK" },
  { id: 1480, classId: 12, name: "Devourer", role: "DAMAGER" },
  { id: 102, classId: 11, name: "Balance", role: "DAMAGER" },
  { id: 103, classId: 11, name: "Feral", role: "DAMAGER" },
  { id: 104, classId: 11, name: "Guardian", role: "TANK" },
  { id: 105, classId: 11, name: "Restoration", role: "HEALER" },
  { id: 1467, classId: 13, name: "Devastation", role: "DAMAGER" },
  { id: 1468, classId: 13, name: "Preservation", role: "HEALER" },
  { id: 1473, classId: 13, name: "Augmentation", role: "DAMAGER" },
  { id: 253, classId: 3, name: "Beast Mastery", role: "DAMAGER" },
  { id: 254, classId: 3, name: "Marksmanship", role: "DAMAGER" },
  { id: 255, classId: 3, name: "Survival", role: "DAMAGER" },
  { id: 62, classId: 8, name: "Arcane", role: "DAMAGER" },
  { id: 63, classId: 8, name: "Fire", role: "DAMAGER" },
  { id: 64, classId: 8, name: "Frost", role: "DAMAGER" },
  { id: 268, classId: 10, name: "Brewmaster", role: "TANK" },
  { id: 270, classId: 10, name: "Mistweaver", role: "HEALER" },
  { id: 269, classId: 10, name: "Windwalker", role: "DAMAGER" },
  { id: 65, classId: 2, name: "Holy", role: "HEALER" },
  { id: 66, classId: 2, name: "Protection", role: "TANK" },
  { id: 70, classId: 2, name: "Retribution", role: "DAMAGER" },
  { id: 256, classId: 5, name: "Discipline", role: "HEALER" },
  { id: 257, classId: 5, name: "Holy", role: "HEALER" },
  { id: 258, classId: 5, name: "Shadow", role: "DAMAGER" },
  { id: 259, classId: 4, name: "Assassination", role: "DAMAGER" },
  { id: 260, classId: 4, name: "Outlaw", role: "DAMAGER" },
  { id: 261, classId: 4, name: "Subtlety", role: "DAMAGER" },
  { id: 262, classId: 7, name: "Elemental", role: "DAMAGER" },
  { id: 263, classId: 7, name: "Enhancement", role: "DAMAGER" },
  { id: 264, classId: 7, name: "Restoration", role: "HEALER" },
  { id: 265, classId: 9, name: "Affliction", role: "DAMAGER" },
  { id: 266, classId: 9, name: "Demonology", role: "DAMAGER" },
  { id: 267, classId: 9, name: "Destruction", role: "DAMAGER" },
  { id: 71, classId: 1, name: "Arms", role: "DAMAGER" },
  { id: 72, classId: 1, name: "Fury", role: "DAMAGER" },
  { id: 73, classId: 1, name: "Protection", role: "TANK" },
];

export const SPEC_BY_ID: ReadonlyMap<number, SpecInfo> = new Map(SPECS.map((s) => [s.id, s]));

/**
 * Ключ персонажа в формате RCLootCouncil: "Имя-Реалм", реалм без пробелов.
 * Имя — как в игре (первая буква заглавная), реалм — локализованное имя.
 */
export function rclcKey(name: string, realmName: string): string {
  return `${name}-${realmName.replace(/\s+/g, "")}`;
}
