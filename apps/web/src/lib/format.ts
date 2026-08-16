import { CLASS_COLORS, CLASS_IDS, CLASS_NAMES_RU, SPEC_BY_ID, type ClassId } from "@easyroster/core";

export function classFile(classId: number) {
  return CLASS_IDS[classId as ClassId];
}
export function classColor(classId: number): string {
  const f = classFile(classId);
  return f ? CLASS_COLORS[f] : "inherit";
}
export function className(classId: number): string {
  const f = classFile(classId);
  return f ? CLASS_NAMES_RU[f] : `#${classId}`;
}
export function specName(specId: number | null): string {
  if (!specId) return "—";
  return SPEC_BY_ID.get(specId)?.name ?? `#${specId}`;
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
