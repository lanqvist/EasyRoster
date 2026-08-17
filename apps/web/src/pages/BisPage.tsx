import { useCallback, useEffect, useState } from "react";
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
  const slots = BIS_SLOT_ORDER.filter((s) => team.some((r) => r.perSlot[s]));

  return (
    <div>
      <h1>BiS-листы статика</h1>
      {err && <div className="alert bad">{err}</div>}

      <div className="card" style={{ padding: "12px 16px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
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
                      {s.lastRun ? relTime(s.lastRun.at) : "—"}
                      {s.lastRun && !s.lastRun.ok ? " ⚠" : ""}
                    </td>
                    <td>
                      {(s.source === "icyveins" || s.source === "wcl") && (
                        <span className="row" style={{ gap: 6 }}>
                          <button disabled={running} onClick={() => refresh(s.source as "icyveins" | "wcl", false)} title="Только спеки рейдеров">
                            {s.running ? "…" : "Обновить (ростер)"}
                          </button>
                          <button disabled={running} onClick={() => refresh(s.source as "icyveins" | "wcl", true)} title="Все 40 спек">
                            Все спеки
                          </button>
                        </span>
                      )}
                      {s.source === "droptimizer" && <span className="muted" style={{ fontSize: 12 }}>ссылки Raidbots — в карточке персонажа</span>}
                      {s.source === "simc" && <span className="muted" style={{ fontSize: 12 }}>автосим — панель ниже</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, maxWidth: 360 }} title="Icy Veins — авторские BiS-списки (Overall / Raid / M+ / тир / тринкеты). WCL — популярность предметов у топ-парсов Mythic текущего рейда. Итог = взвешенная сумма; персональный сим (SimC/Droptimizer, если свежий) поднимает предметы по % апгрейда.">
            {status?.progress ? (
              <div>
                {SOURCE_LABEL[status.progress.source]}: {status.progress.done}/{status.progress.total} — {status.progress.current}
              </div>
            ) : (
              <span>ⓘ как считается{config?.warcraftLogs.hasSecret ? "" : " · WCL: нужны ключи в Настройках"}</span>
            )}
          </div>
        </div>
      </div>

      <SimPanel />

      <BisHeatmap team={team} onSelect={setSelected} />

      {selected !== null && <CharacterDrawer id={selected} onClose={() => setSelected(null)} initialTab="bis" />}
    </div>
  );
}
