import { useMemo, useState } from "react";
import { BIS_SLOT_ORDER, SLOT_NAMES_RU, type BisTeamRow } from "@easyroster/core";
import { classColor, relTime, ROLE_RU, specName } from "../lib/format";
import { OBTAINED_STYLE, ObtainedLegend } from "./BisSlotList";
import { KIND_LABEL } from "./SourceChips";
import { ClassIcon } from "./ClassIcon";
import { SimNowButton } from "./SimNowButton";

type SortKey = "potential" | "name" | "pct" | "ilvl" | "role" | "sim";

/** Сводка BiS по статику: карточки персонажей с полосой статусов слотов; раскрытие — детали по слотам. */
export function BisHeatmap({ team, onSelect }: { team: BisTeamRow[]; onSelect: (characterId: number) => void }) {
  const [onlySim, setOnlySim] = useState(false);
  const [role, setRole] = useState<"" | "TANK" | "HEALER" | "DAMAGER">("");
  const [sort, setSort] = useState<SortKey>("potential");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const rows = useMemo(() => {
    let r = team.filter((x) => (!onlySim || x.hasSim) && (!role || x.role === role) && (!search || x.name.toLowerCase().includes(search.toLowerCase())));
    const cmp: Record<SortKey, (a: BisTeamRow, b: BisTeamRow) => number> = {
      potential: (a, b) => (b.potential?.total ?? -1) - (a.potential?.total ?? -1) || (a.coverage?.pct ?? -1) - (b.coverage?.pct ?? -1) || a.name.localeCompare(b.name, "ru"),
      name: (a, b) => a.name.localeCompare(b.name, "ru"),
      pct: (a, b) => (a.coverage?.pct ?? -1) - (b.coverage?.pct ?? -1) || a.name.localeCompare(b.name, "ru"),
      ilvl: (a, b) => (b.ilvl ?? 0) - (a.ilvl ?? 0),
      role: (a, b) => (a.role ?? "Z").localeCompare(b.role ?? "Z") || a.name.localeCompare(b.name, "ru"),
      sim: (a, b) => (a.simAt ?? 0) - (b.simAt ?? 0),
    };
    return [...r].sort(cmp[sort]);
  }, [team, onlySim, role, sort, search]);

  const slots = BIS_SLOT_ORDER.filter((s) => team.some((r) => r.perSlot[s]));
  const withSim = team.filter((t) => t.hasSim).length;
  const maxPot = Math.max(1, ...team.map((t) => t.potential?.total ?? 0));
  const teamPot = team.filter((t) => t.potential);
  const sumRaid = teamPot.reduce((a, t) => a + (t.potential?.raid ?? 0), 0);
  const sumM = teamPot.reduce((a, t) => a + (t.potential?.mplus ?? 0), 0);
  const sortBtn = (k: SortKey, label: string) => (
    <button key={k} className={sort === k ? "primary" : undefined} style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => setSort(k)}>{label}</button>
  );

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
          <span className="muted" style={{ fontSize: 12 }}>сортировка:</span>
          {sortBtn("potential", "потенциал")}{sortBtn("pct", "BiS %")}{sortBtn("ilvl", "ilvl")}{sortBtn("role", "роль")}{sortBtn("sim", "сим")}{sortBtn("name", "имя")}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }} title="Потенциал = сумма лучших положительных % сима по слотам (на выбранной сложности): сколько всего DPS/итог можно добрать. Разбивка — по источнику лучшего предмета слота: рейд (в т.ч. катализатор) / M+ (в т.ч. тайник). BiS % = слотов, закрытых предметом на макс. треке.">
        ⓘ <b>потенциал</b> — сколько % ещё можно добрать (сумма лучших апгрейдов по слотам){teamPot.length ? <> · по статику: из рейда {sumRaid.toFixed(0)} %, из M+ {sumM.toFixed(0)} %</> : null} · <b>BiS %</b> — слотов на макс. треке (на старте сезона у всех ≈0)
      </div>
      {rows.length === 0 ? (
        <div className="placeholder">Никого не найдено по фильтрам.</div>
      ) : (
        <div className="cand-list">
          {rows.map((r) => {
            const isOpen = !!open[r.characterId];
            const cov = r.coverage;
            return (
              <div key={r.characterId} className={`bis-card${isOpen ? " active" : ""}`} title="клик — детали по слотам; «карточка» — полная карточка персонажа" onClick={() => setOpen({ ...open, [r.characterId]: !isOpen })}>
                <div className="bis-card-row">
                  <div className="bis-card-who">
                    <div style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <ClassIcon classId={r.classId} size={18} /><span style={{ color: classColor(r.classId), fontWeight: 700 }}>{r.name}</span>
                      <span className="muted" style={{ fontSize: 12 }}> · {specName(r.specId)}{r.role ? ` · ${ROLE_RU[r.role]}` : ""}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      ilvl <b className="num">{r.ilvl?.toFixed(0) ?? "—"}</b>
                      {" · "}{r.hasSim ? `сим ${relTime(r.simAt)}` : <span style={{ color: "var(--warn)" }}>сима нет</span>}
                      {cov ? ` · ${cov.obtained} из ${cov.slots} на макс. треке, ${cov.lower} ниже трека` : ""}
                    </div>
                  </div>
                  <div className="bis-strip" title="Слоты: цвет — статус лучшего кандидата (зелёный есть, жёлтый ниже трек, голубой катализатор, красный нет)">
                    {slots.map((s) => {
                      const st = r.perSlot[s];
                      const style = st && st !== "none" ? OBTAINED_STYLE[st] : null;
                      const best = r.perSlotBest[s];
                      return (
                        <span
                          key={s}
                          className="bis-seg"
                          title={`${SLOT_NAMES_RU[s]}: ${style?.label ?? "нет данных"}${best ? ` — ${best.name}${best.pct != null ? ` (${best.pct > 0 ? "+" : ""}${best.pct.toFixed(1)}%)` : ""}` : ""}`}
                          style={{ background: style ? style.color : "var(--bg-elev-2)", opacity: style ? 0.9 : 0.4 }}
                        />
                      );
                    })}
                  </div>
                  <div className="bis-card-pct" onClick={(e) => e.stopPropagation()}>
                    {r.potential ? (
                      <div title={`потенциал апгрейда: +${r.potential.total.toFixed(1)}% в ${r.potential.slots} слотах · из рейда +${r.potential.raid.toFixed(1)}% (${r.potential.slotsRaid} сл.) · из M+ +${r.potential.mplus.toFixed(1)}% (${r.potential.slotsMplus} сл.) · BiS ${cov?.pct ?? 0}%`}>
                        <div className="num" style={{ fontSize: 22, fontWeight: 700, color: r.potential.total >= 10 ? "var(--ok)" : r.potential.total >= 3 ? "var(--warn)" : "var(--text-muted)" }}>
                          +{r.potential.total.toFixed(1)}%
                        </div>
                        <div className="pot-bar" title="доля: рейд / M+">
                          <span style={{ width: `${(r.potential.raid / maxPot) * 100}%`, background: "var(--accent)" }} />
                          <span style={{ width: `${(r.potential.mplus / maxPot) * 100}%`, background: "var(--warn)" }} />
                        </div>
                        <div className="muted num" style={{ fontSize: 10 }}>рейд {r.potential.raid.toFixed(1)} · M+ {r.potential.mplus.toFixed(1)} · BiS {cov?.pct ?? 0}%</div>
                      </div>
                    ) : (
                      <div className="num" style={{ fontSize: 22, fontWeight: 700, color: cov && cov.pct >= 50 ? "var(--ok)" : cov && cov.pct > 0 ? "var(--warn)" : "var(--text-muted)" }} title="Слотов BiS на макс. треке / всего (сима нет — потенциал не считается)">
                        {cov ? `${cov.pct}%` : "—"}
                      </div>
                    )}
                    <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <button style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => onSelect(r.characterId)}>карточка</button>
                      <SimNowButton characterId={r.characterId} small />
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="bis-card-detail" onClick={(e) => e.stopPropagation()}>
                    {slots.map((s) => {
                      const st = r.perSlot[s];
                      const style = st && st !== "none" ? OBTAINED_STYLE[st] : null;
                      const best = r.perSlotBest[s];
                      return (
                        <div key={s} className="bis-detail-row" style={{ borderLeftColor: style?.color ?? "var(--border)" }}>
                          <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", width: 86, flex: "none" }}>{SLOT_NAMES_RU[s]}</span>
                          <span className="muted num" style={{ width: 92, flex: "none", fontSize: 11 }} title="надето сейчас">
                            {(r.perSlotEquipped[s] ?? []).map((eq) => `${eq.ilvl ?? "?"}${eq.track ? ` ${eq.track.replace(/^(\w)\w*/, "$1")}` : ""}`).join(" / ") || "—"}
                          </span>
                          <span className="muted" style={{ flex: "none" }}>→</span>
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" }}>{best?.name ?? <span className="muted">нет кандидатов</span>}{best?.kind ? <span className="muted" style={{ fontSize: 10 }}> · {KIND_LABEL[best.kind]}</span> : null}</span>
                          <span className="num" style={{ width: 60, textAlign: "right", fontWeight: 600, color: best?.pct != null ? (best.pct > 0.05 ? "var(--ok)" : "var(--text-muted)") : "var(--text-muted)" }}>
                            {best?.pct != null ? `${best.pct > 0 ? "+" : ""}${best.pct.toFixed(1)}%` : ""}
                          </span>
                          <span style={{ width: 96, textAlign: "right", fontSize: 11, color: style?.color ?? "var(--text-muted)" }}>{style?.label ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: 8 }}><ObtainedLegend extra={<span>полоса — статус лучшего кандидата по слотам · клик по карточке — детали по слотам</span>} /></div>
    </div>
  );
}
