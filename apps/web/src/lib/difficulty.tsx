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
    <span className="row" style={{ gap: 4 }} title="Сложность рейда: определяет трек/ilvl и % сима для рейдовых предметов">
      {!compact && <span className="muted" style={{ fontSize: 12 }}>Рейд:</span>}
      {(["normal", "heroic", "mythic"] as RaidDifficulty[]).map((d) => (
        <button
          key={d}
          className={difficulty === d ? "primary" : undefined}
          style={{ padding: "2px 8px", fontSize: 12 }}
          onClick={() => setDifficulty(d)}
          title={`${RAID_DIFFICULTY_LABEL[d]} → трек ${TRACK_NAMES_RU[RAID_DIFFICULTY_TRACK[d]] ?? RAID_DIFFICULTY_TRACK[d]}`}
        >
          {RAID_DIFFICULTY_LABEL[d]}
        </button>
      ))}
    </span>
  );
}
