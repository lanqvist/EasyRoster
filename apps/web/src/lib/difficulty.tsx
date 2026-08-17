import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RAID_DIFFICULTY_LABEL, RAID_DIFFICULTY_TRACK, TRACK_NAMES_RU, type RaidDifficulty } from "@easyroster/core";
import { useConfig } from "./config-context";

/**
 * Сложность рейда «сейчас» — одна на всё приложение: хранится в конфиге (`season.raidDifficulty`),
 * тот же параметр использует экспорт db.lua и BiS-движок на сервере. Переключатель — в сайдбаре.
 */
const Ctx = createContext<{ difficulty: RaidDifficulty; setDifficulty: (d: RaidDifficulty) => void; saving: boolean } | null>(null);
const LEGACY_KEY = "easyroster.difficulty";

export function DifficultyProvider({ children }: { children: ReactNode }) {
  const { config, save } = useConfig();
  const [override, setOverride] = useState<RaidDifficulty | null>(null);
  const [saving, setSaving] = useState(false);
  const difficulty: RaidDifficulty = override ?? config?.season.raidDifficulty ?? "normal";
  // старое значение из localStorage больше не используется — чтобы не расходилось с настройкой
  useEffect(() => localStorage.removeItem(LEGACY_KEY), []);
  const setDifficulty = (d: RaidDifficulty) => {
    setOverride(d);
    setSaving(true);
    // ConfigPatch = deepPartial, но season с default() не становится partial в типах — сервер принимает частичный объект
    save({ season: { raidDifficulty: d } } as unknown as Parameters<typeof save>[0])
      .catch(() => undefined)
      .finally(() => {
        setSaving(false);
        setOverride(null);
      });
  };
  return <Ctx.Provider value={{ difficulty, setDifficulty, saving }}>{children}</Ctx.Provider>;
}

export function useDifficulty() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDifficulty вне DifficultyProvider");
  return v;
}

/** Переключатель Normal / Heroic / Mythic (в сайдбаре — один на всё приложение). */
export function DifficultySwitch({ compact = false }: { compact?: boolean }) {
  const { difficulty, setDifficulty, saving } = useDifficulty();
  return (
    <label className={compact ? "row" : "diff-switch"} style={{ gap: 6, alignItems: "center" }} title="На какой сложности вы сейчас рейдите: определяет трек/ilvl выпадающих предметов и какой % сима показывать как основной — во всём приложении и в db.lua для аддона. Разбивка по всем сложностям видна в карточках.">
      <span style={{ fontSize: 12 }}>{compact ? "Сложность:" : "Сложность рейда сейчас"}</span>
      <select value={difficulty} disabled={saving} onChange={(e) => setDifficulty(e.target.value as RaidDifficulty)} style={{ fontWeight: 600, width: compact ? undefined : "100%" }}>
        {(["normal", "heroic", "mythic"] as RaidDifficulty[]).map((d) => (
          <option key={d} value={d}>
            {RAID_DIFFICULTY_LABEL[d]} → {TRACK_NAMES_RU[RAID_DIFFICULTY_TRACK[d]] ?? RAID_DIFFICULTY_TRACK[d]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Разбивка % сима по трекам: «Н +1.2 · Г +2.9 · М +4.8», активный трек жирным. */
export function TrackBreakdown({ byTrack, active, size = 11 }: { byTrack: Record<string, number> | null | undefined; active?: string | null; size?: number }) {
  if (!byTrack) return null;
  const order = ["Champion", "Hero", "Myth"];
  const short: Record<string, string> = { Champion: "Н", Hero: "Г", Myth: "М" };
  const parts = order.filter((t) => byTrack[t] != null);
  if (parts.length < 2) return null;
  return (
    <span className="num" style={{ fontSize: size, whiteSpace: "nowrap" }} title="Normal → Чемпион, Heroic → Герой, Mythic → Миф">
      {parts.map((t, i) => {
        const v = byTrack[t]!;
        const isActive = t === active;
        return (
          <span key={t} style={{ fontWeight: isActive ? 700 : 400, color: isActive ? (v > 0.05 ? "var(--ok)" : v < -0.05 ? "var(--bad)" : "var(--text)") : "var(--text-muted)" }}>
            {i ? " · " : ""}{short[t]} {v > 0 ? "+" : ""}{v.toFixed(1)}
          </span>
        );
      })}
    </span>
  );
}
