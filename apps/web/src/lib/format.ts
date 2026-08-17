import { CLASS_COLORS, CLASS_IDS, CLASS_NAMES_RU, SPEC_BY_ID, SPEC_NAMES_RU, type ClassId } from "@easyroster/core";

export function classFile(classId: number) {
  return CLASS_IDS[classId as ClassId];
}
/** Слишком светлые цвета классов — затемняем в светлой теме. */
const LIGHT_THEME_CLASS_COLORS: Partial<Record<ReturnType<typeof classFile>, string>> = {
  PRIEST: "#7a8090",
  ROGUE: "#b3a000",
  MONK: "#0a9a5c",
  HUNTER: "#6f9a3a",
  MAGE: "#1f9ac2",
};
export function classColor(classId: number): string {
  const f = classFile(classId);
  if (!f) return "inherit";
  if (document.documentElement.getAttribute("data-theme") === "light") return LIGHT_THEME_CLASS_COLORS[f] ?? CLASS_COLORS[f];
  return CLASS_COLORS[f];
}
export function className(classId: number): string {
  const f = classFile(classId);
  return f ? CLASS_NAMES_RU[f] : `#${classId}`;
}
export function specName(specId: number | null): string {
  if (!specId) return "—";
  return SPEC_NAMES_RU[specId] ?? SPEC_BY_ID.get(specId)?.name ?? `#${specId}`;
}
export function roleOf(specId: number | null): "TANK" | "HEALER" | "DAMAGER" | null {
  if (!specId) return null;
  return SPEC_BY_ID.get(specId)?.role ?? null;
}
export const ROLE_RU = { TANK: "Танк", HEALER: "Хил", DAMAGER: "ДД" } as const;

export function relTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return `${d} дн назад`;
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export const QUALITY_COLORS: Record<string, string> = {
  POOR: "#9d9d9d",
  COMMON: "#ffffff",
  UNCOMMON: "#1eff00",
  RARE: "#0070dd",
  EPIC: "#a335ee",
  LEGENDARY: "#ff8000",
  ARTIFACT: "#e6cc80",
  HEIRLOOM: "#00ccff",
};

export const QUALITY_COLORS_NUM: Record<number, string> = {
  0: "#9d9d9d", 1: "#ffffff", 2: "#1eff00", 3: "#0070dd", 4: "#a335ee", 5: "#ff8000", 6: "#e6cc80", 7: "#00ccff",
};

export const FIGHT_STYLE_RU: Record<string, string> = {
  Patchwerk: "Одна цель (Patchwerk)",
  HecticAddCleave: "Босс + адды (HecticAddCleave)",
  DungeonSlice: "Подземелье (DungeonSlice)",
  LightMovement: "Лёгкое движение (LightMovement)",
  HeavyMovement: "Много движения (HeavyMovement)",
};
