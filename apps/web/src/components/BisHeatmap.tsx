import { useMemo, useState } from "react";
import { BIS_SLOT_ORDER, SLOT_NAMES_RU, type BisTeamRow } from "@easyroster/core";
import { classColor, relTime, ROLE_RU, specName } from "../lib/format";
import { OBTAINED_STYLE } from "./BisSlotList";
import { DifficultySwitch } from "../lib/difficulty";

const SLOT_SHORT: Record<string, string> = {
  HEAD: "Гол", NECK: "Шея", SHOULDER: "Плч", BACK: "Плщ", CHEST: "Грд", WRIST: "Зап", HANDS: "Кст", WAIST: "Пояс", LEGS: "Ног", FEET: "Ступ",
  FINGER: "Кол", TRINKET: "Акс", MAIN_HAND: "Прав", OFF_HAND: "Лев", WEAPON: "Ор", TWO_HAND: "2р",
};

type SortKey = "name" | "pct" | "ilvl" | "role" | "sim";

/** Сводная тепловая карта BiS по статику: строка — персонаж, колонка — слот; цвет = статус, число = % сима лучшего кандидата. */
export function BisHeatmap({ team, onSelect }: { team: BisTeamRow[]; onSelect: (characterId: number) => void }) {
  const [onlySim, setOnlySim] = useState(false);
  const [role, setRole] = useState<"" | "TANK" | "HEALER" | "DAMAGER">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "pct", dir: 1 });
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    let r = team.filter((x) => (!onlySim || x.hasSim) && (!role || x.role === role) && (!search || x.name.toLowerCase().includes(search.toLowerCase())));
    const cmp: Record<SortKey, (a: BisTeamRow, b: BisTeamRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "ru"),
      pct: (a, b) => (a.coverage?.pct ?? -1) - (b.coverage?.pct ?? -1),
      ilvl: (a, b) => (a.ilvl ?? 0) - (b.ilvl ?? 0),
      role: (a, b) => (a.role ?? "Z").localeCompare(b.role ?? "Z") || a.name.localeCompare(b.name, "ru"),
      sim: (a, b) => (a.simAt ?? 0) - (b.simAt ?? 0),
    };
    r = [...r].sort((a, b) => cmp[sort.key](a, b) * sort.dir);
    return r;
  }, [team, onlySim, role, sort, search]);

  const slots = BIS_SLOT_ORDER.filter((s) => team.some((r) => r.perSlot[s]));
  const th = (key: SortKey, label: string, title?: string, cls?: string) => (
    <th className={cls} title={title} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}>
      {label} {sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : ""}
    </th>
  );
  const withSim = team.filter((t) => t.hasSim).length;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", margin: "6px 0 8px" }}>
        <div className="row">
          <b>Сводка BiS по статику</b>
          <input placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 140 }} />
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="">Все роли</option>
            <option value="TANK">Танки</option>
            <option value="HEALER">Хилы</option>
            <option value="DAMAGER">ДД</option>
          </select>
          <label className="row" style={{ gap: 6, fontSize: 13 }} title="Только персонажи со свежим персональным симом (SimC/Droptimizer)">
            <input type="checkbox" checked={onlySim} onChange={(e) => setOnlySim(e.target.checked)} /> только с симом ({withSim}/{team.length})
          </label>
        </div>
        <DifficultySwitch />
      </div>
      {rows.length === 0 ? (
        <div className="placeholder">Никого не найдено по фильтрам.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                {th("name", "Персонаж")}
                {th("role", "Роль")}
                {th("ilvl", "ilvl", undefined, "num")}
                {th("pct", "BiS %", "Слотов BiS получено на макс. треке / всего", "num")}
                {th("sim", "Сим", "Свежесть персонального сима")}
                {slots.map((s) => (
                  <th key={s} style={{ textAlign: "center", fontSize: 10, padding: "4px 2px" }} title={SLOT_NAMES_RU[s]}>
                    {SLOT_SHORT[s] ?? (SLOT_NAMES_RU[s] ?? s).slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.characterId} style={{ cursor: "pointer" }} onClick={() => onSelect(r.characterId)}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span style={{ color: classColor(r.classId), fontWeight: 600 }}>{r.name}</span>
                    <span className="muted"> · {specName(r.specId)}</span>
                  </td>
                  <td className="muted">{r.role ? ROLE_RU[r.role] : "—"}</td>
                  <td className="num">{r.ilvl?.toFixed(0) ?? "—"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {r.coverage ? <span title={`получено ${r.coverage.obtained}, ниже трек/катализатор ${r.coverage.lower}, всего ${r.coverage.slots}`}>{r.coverage.pct}%</span> : "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 11, whiteSpace: "nowrap", color: r.hasSim ? undefined : "var(--warn)" }}>{r.hasSim ? relTime(r.simAt) : "нет"}</td>
                  {slots.map((s) => {
                    const st = r.perSlot[s];
                    const style = st && st !== "none" ? OBTAINED_STYLE[st] : null;
                    const best = r.perSlotBest[s];
                    const pct = best?.pct;
                    const showPct = style && st !== "yes" && pct != null;
                    return (
                      <td
                        key={s}
                        style={{ textAlign: "center", padding: "2px 2px", background: style ? style.bg : undefined }}
                        title={`${SLOT_NAMES_RU[s]}: ${style?.label ?? "нет данных"}${best ? ` · ${best.name}${pct != null ? ` ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : ""}` : ""}`}
                      >
                        {showPct ? (
                          <span className="num" style={{ fontSize: 10, color: pct > 0.05 ? "var(--ok)" : "var(--text-muted)", fontWeight: 600 }}>
                            {pct > 0 ? "+" : ""}{Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: style ? style.color : "var(--bg-elev-2)", opacity: style ? 0.9 : 0.5 }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted row" style={{ fontSize: 11, marginTop: 8, gap: 14 }}>
            {(["yes", "lower", "catalyst", "no"] as const).map((k) => (
              <span key={k}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: OBTAINED_STYLE[k].color, marginRight: 4 }} />
                {OBTAINED_STYLE[k].label}
              </span>
            ))}
            <span>число в ячейке — % сима лучшего недостающего кандидата для выбранной сложности</span>
          </div>
        </div>
      )}
    </div>
  );
}
