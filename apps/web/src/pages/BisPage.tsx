import { useCallback, useEffect, useState } from "react";
import { BIS_SLOT_ORDER, SLOT_NAMES_RU, type BisSourceStatus, type BisTeamRow } from "@easyroster/core";
import { api } from "../lib/api";
import { classColor, relTime, specName } from "../lib/format";
import { useConfig } from "../lib/config-context";
import { OBTAINED_STYLE, SOURCE_LABEL } from "../components/BisSlotList";
import { CharacterDrawer } from "../components/CharacterDrawer";

export function BisPage() {
  const { config } = useConfig();
  const [status, setStatus] = useState<{ sources: BisSourceStatus[]; progress: { source: string; done: number; total: number; current: string } | null } | null>(null);
  const [team, setTeam] = useState<BisTeamRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.bisStatus(), api.bisTeam()]);
      setStatus(s);
      setTeam(t);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

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
                <th className="num">Спек</th>
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
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, maxWidth: 360 }}>
            {status?.progress ? (
              <div>
                {SOURCE_LABEL[status.progress.source]}: {status.progress.done}/{status.progress.total} — {status.progress.current}
              </div>
            ) : (
              <>
                <div>Icy Veins — авторские BiS-списки (Overall / Raid / M+ / тир / тринкеты).</div>
                <div>WCL — популярность предметов у топ-парсов Mythic текущего рейда{config?.warcraftLogs.hasSecret ? "" : " (нужны ключи в Настройках)"}.</div>
                <div>Итог = взвешенная сумма; персональный Droptimizer (если свежий) поднимает предметы по % апгрейда.</div>
              </>
            )}
          </div>
        </div>
      </div>

      {team.length === 0 ? (
        <div className="placeholder">Нет рейдеров с синхронизированной спекой. Обновите ростер и источники BiS.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Персонаж</th>
                <th className="num">ilvl</th>
                <th className="num" title="Слотов BiS получено на макс. треке / всего">BiS %</th>
                {slots.map((s) => (
                  <th key={s} style={{ textAlign: "center", fontSize: 10, padding: "4px 2px" }} title={SLOT_NAMES_RU[s]}>
                    {(SLOT_NAMES_RU[s] ?? s).slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((r) => (
                <tr key={r.characterId} style={{ cursor: "pointer" }} onClick={() => setSelected(r.characterId)}>
                  <td>
                    <span style={{ color: classColor(r.classId), fontWeight: 600 }}>{r.name}</span>
                    <span className="muted"> · {specName(r.specId)}</span>
                  </td>
                  <td className="num">{r.ilvl?.toFixed(0) ?? "—"}</td>
                  <td className="num">
                    {r.coverage ? (
                      <span title={`получено ${r.coverage.obtained}, ниже трек/катализатор ${r.coverage.lower}, всего ${r.coverage.slots}`}>
                        {r.coverage.pct}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {slots.map((s) => {
                    const st = r.perSlot[s];
                    const style = st && st !== "none" ? OBTAINED_STYLE[st] : null;
                    return (
                      <td key={s} style={{ textAlign: "center", padding: "3px 2px" }} title={style?.label ?? "нет данных"}>
                        <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: style ? style.color : "var(--bg-elev-2)", opacity: style ? 0.9 : 0.5 }} />
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
          </div>
        </div>
      )}

      {selected !== null && <CharacterDrawer id={selected} onClose={() => setSelected(null)} initialTab="bis" />}
    </div>
  );
}
