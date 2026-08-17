import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BIS_SLOT_ORDER, SLOT_NAMES_RU, type BisSourceStatus, type BisTeamRow } from "@easyroster/core";
import { api } from "../lib/api";
import { SimPanel } from "../components/SimPanel";
import { classColor, relTime, specName } from "../lib/format";
import { useConfig } from "../lib/config-context";
import { OBTAINED_STYLE, SOURCE_LABEL } from "../components/BisSlotList";
import { CharacterDrawer } from "../components/CharacterDrawer";
import { BisHeatmap } from "../components/BisHeatmap";
import { useDifficulty } from "../lib/difficulty";

export function BisPage() {
  const { config } = useConfig();
  const [status, setStatus] = useState<{ sources: BisSourceStatus[]; progress: { source: string; done: number; total: number; current: string } | null } | null>(null);
  const [team, setTeam] = useState<BisTeamRow[]>([]);
  const { difficulty } = useDifficulty();
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.bisStatus(), api.bisTeam(difficulty)]);
      setStatus(s);
      setTeam(t);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [difficulty]);

  useEffect(() => {
    void load();
    const id = setInterval(async () => {
      try {
        const s = await api.bisStatus();
        setStatus(s);
        if (!s.progress) void load();
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [load]);

  const refresh = async (source: "icyveins" | "wcl", all: boolean) => {
    try {
      await api.bisRefresh(source, { all });
      setStatus(await api.bisStatus());
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const running = !!status?.progress;
  const [openSources, setOpenSources] = useState<boolean>(() => localStorage.getItem("easyroster.bisSources") === "1");
  useEffect(() => localStorage.setItem("easyroster.bisSources", openSources ? "1" : "0"), [openSources]);
  const iv = status?.sources.find((s) => s.source === "icyveins");
  const wcl = status?.sources.find((s) => s.source === "wcl");
  const noWclKeys = !config?.warcraftLogs.hasSecret;
  const summary = status
    ? `Icy Veins ${iv?.lastRun ? relTime(iv.lastRun.at) : "—"} · WCL ${noWclKeys ? "нет ключей" : wcl?.lastRun ? (wcl.lastRun.ok ? relTime(wcl.lastRun.at) : "ошибка") : "—"} · SimC ${status.sources.find((s) => s.source === "simc")?.specs ?? 0} перс.`
    : "…";

  return (
    <div>
      <h1>BiS-листы статика</h1>
      {err && <div className="alert bad">{err}</div>}

      <BisHeatmap team={team} onSelect={setSelected} />

      {/* служебное: источники BiS и автосим — свернуто, раскрывается по клику */}
      <div className="card" style={{ padding: "10px 16px", marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpenSources((v) => !v)}>
          <div>
            <b>Данные и симы</b> <span className="muted" style={{ fontSize: 12 }}>{status?.progress ? `${SOURCE_LABEL[status.progress.source]}: ${status.progress.done}/${status.progress.total} — ${status.progress.current}` : summary}</span>
          </div>
          <button style={{ padding: "2px 10px", fontSize: 12 }}>{openSources ? "Свернуть" : "Подробно"}</button>
        </div>
        {(openSources || running) && (
          <div style={{ marginTop: 10 }}>
            <table style={{ width: "auto" }}>
              <thead>
                <tr>
                  <th>Источник</th>
                  <th className="num" title="спек (для общих источников) или персонажей (для персональных симов)">Спек/перс.</th>
                  <th className="num">Кандидатов</th>
                  <th>Обновлено</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {status?.sources
                  .filter((s) => s.source !== "manual")
                  .map((s) => (
                    <tr key={s.source}>
                      <td>{SOURCE_LABEL[s.source]}</td>
                      <td className="num">{s.specs}</td>
                      <td className="num">{s.candidates}</td>
                      <td className="muted" title={s.lastRun?.message ?? ""} style={{ color: s.lastRun && !s.lastRun.ok ? "var(--bad)" : undefined }}>
                        {s.source === "wcl" && noWclKeys ? (
                          <span style={{ color: "var(--warn)" }}>нет ключей — <Link to="/settings">Настройки → Ключи API</Link></span>
                        ) : (
                          <>
                            {s.lastRun ? relTime(s.lastRun.at) : "—"}
                            {s.lastRun && !s.lastRun.ok ? <span style={{ color: "var(--bad)" }}> ⚠ {s.lastRun.message?.slice(0, 80)}</span> : ""}
                          </>
                        )}
                      </td>
                      <td>
                        {(s.source === "icyveins" || s.source === "wcl") && (
                          <span className="row" style={{ gap: 6 }}>
                            <button disabled={running || (s.source === "wcl" && noWclKeys)} onClick={() => refresh(s.source as "icyveins" | "wcl", false)} title="Только спеки рейдеров">
                              {s.running ? "…" : "Обновить (ростер)"}
                            </button>
                            <button disabled={running || (s.source === "wcl" && noWclKeys)} onClick={() => refresh(s.source as "icyveins" | "wcl", true)} title="Все 40 спек">
                              Все спеки
                            </button>
                          </span>
                        )}
                        {s.source === "droptimizer" && <span className="muted" style={{ fontSize: 12 }}>ссылки Raidbots — в карточке персонажа</span>}
                        {s.source === "simc" && <span className="muted" style={{ fontSize: 12 }}>автосим — ниже</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, margin: "8px 0" }}>
              Icy Veins — авторские BiS-списки (Overall / Raid / M+ / тир / тринкеты). WCL — популярность предметов у топ-парсов Mythic текущего рейда. Итог = взвешенная сумма; персональный сим (SimC/Droptimizer, если свежий) даёт % апгрейда и порядок кандидатов.
            </div>
            <SimPanel />
          </div>
        )}
      </div>

      {selected !== null && <CharacterDrawer id={selected} onClose={() => setSelected(null)} initialTab="bis" />}
    </div>
  );
}
