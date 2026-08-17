import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RAID_DIFFICULTY_LABEL, RAID_DIFFICULTY_TRACK, TRACK_NAMES_RU, type RaidDifficulty } from "@easyroster/core";
import { useConfig } from "./config-context";

/** Выбранная сложность рейда для отображения треков/процентов (по умолчанию — из настроек, запоминается в localStorage). */
const KEY = "easyroster.difficulty";
const Ctx = createContext<{ difficulty: RaidDifficulty; setDifficulty: (d: RaidDifficulty) => void } | null>(null);

export function DifficultyProvider({ children }: { children: ReactNode }) {
  const { config } = useConfig();
  const [difficulty, setState] = useState<RaidDifficulty>(() => (localStorage.getItem(KEY) as RaidDifficulty | null) ?? "normal");
  useEffect(() => {
    if (!localStorage.getItem(KEY) && config?.season.raidDifficulty) setState(config.season.raidDifficulty);
  }, [config?.season.raidDifficulty]);
  const setDifficulty = (d: RaidDifficulty) => {
    localStorage.setItem(KEY, d);
    setState(d);
  };
  return <Ctx.Provider value={{ difficulty, setDifficulty }}>{children}</Ctx.Provider>;
}

export function useDifficulty() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDifficulty вне DifficultyProvider");
  return v;
}

/** Переключатель Normal / Heroic / Mythic. */
export function DifficultySwitch({ compact = false }: { compact?: boolean }) {
  const { difficulty, setDifficulty } = useDifficulty();
  return (
    <label className="row" style={{ gap: 8, alignItems: "center" }} title="На какой сложности вы сейчас рейдите: определяет трек/ilvl выпадающих предметов и какой % сима показывать как основной. Разбивка по всем сложностям видна в карточках.">
      <span style={{ fontSize: compact ? 12 : 13 }}>{compact ? "Сложность:" : "Сложность рейда сейчас:"}</span>
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as RaidDifficulty)} style={{ fontWeight: 600 }}>
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
