import { useEffect, useState } from "react";
import type { SimStatus } from "@easyroster/core";
import { api } from "../lib/api";
import { useConfig } from "../lib/config-context";
import { relTime, FIGHT_STYLE_RU } from "../lib/format";
import { TRACK_NAMES_RU } from "@easyroster/core";

/** Панель автосима SimulationCraft: установка, очередь, состояние по персонажам. */
export function SimPanel() {
  const { config, save } = useConfig();
  const [st, setSt] = useState<SimStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      setSt(await api.simStatus());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    const id = setInterval(load, st?.running || st?.installing ? 2000 : 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.running, st?.installing]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const chars = st?.characters ?? [];
  const supported = chars.filter((c) => c.supported);
  const fresh = supported.filter((c) => c.lastOk && !c.stale && !c.equipmentChanged).length;
  const staleN = supported.filter((c) => c.stale || c.equipmentChanged).length;
  const enabled = config?.sim.enabled ?? false;

  return (
    <div className="card" style={{ padding: "12px 16px" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <b>Автосим SimulationCraft</b>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            {st?.simcVersion ? `simc ${st.simcVersion.replace(/^simc-/, "")}` : "не установлен"} · {st?.cpuThreads ?? "?"} потоков ·{" "}
            {FIGHT_STYLE_RU[config?.sim.fightStyle ?? ""] ?? config?.sim.fightStyle} · погрешность {config?.sim.targetError}% · рейд {config?.sim.raidTracks.map((t) => TRACK_NAMES_RU[t] ?? t).join("/")}, M+ {config?.sim.dungeonTracks.map((t) => TRACK_NAMES_RU[t] ?? t).join("/")}
          </span>
        </div>
        <div className="row">
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => run(() => save({ sim: { enabled: e.target.checked } } as any))} /> автозапуск
          </label>
          {!st?.simcPath && (
            <button className="primary" disabled={st?.installing} onClick={() => run(api.simInstall)}>
              {st?.installing ? (st.installMessage ?? "Устанавливаю…") : "Установить SimC (~120 МБ)"}
            </button>
          )}
          {st?.simcPath && (
            <>
              <button disabled={st.installing} onClick={() => run(() => api.simRun({ all: true, onlyStale: true }))} title="Только у кого нет свежего сима или сменилась экипировка">
                Симить устаревших ({staleN})
              </button>
              <button disabled={st.installing} onClick={() => run(() => api.simRun({ all: true }))}>
                Симить всех ({supported.length})
              </button>
              {(st.running || st.queue > 0) && <button onClick={() => run(api.simClear)}>Очистить очередь</button>}
            </>
          )}
          <button onClick={() => setOpen((v) => !v)}>{open ? "Скрыть" : "Подробно"}</button>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {st?.installing && <span>{st.installMessage}</span>}
        {st?.running && st.current && (
          <span>
            Сейчас: <b>{st.current.name}</b> — {st.current.stage} · в очереди {st.queue}
          </span>
        )}
        {!st?.running && !st?.installing && st && (
          <span>
            Свежих симов {fresh}/{supported.length}
            {chars.length - supported.length > 0 ? ` · без сима (хилы/нет спеки): ${chars.length - supported.length}` : ""}
            {enabled ? " · автозапуск после синка при смене экипировки" : " · автозапуск выключен"}
          </span>
        )}
      </div>
      {err && <div className="alert bad">{err}</div>}
      {open && st && (
        <table style={{ marginTop: 10, fontSize: 12 }}>
          <thead>
            <tr>
              <th>Персонаж</th>
              <th>Последний сим</th>
              <th className="num">Профильсетов</th>
              <th className="num">База</th>
              <th className="num">Время</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chars.map((c) => (
              <tr key={c.characterId}>
                <td>{c.name}</td>
                <td className="muted">{c.lastRunAt ? relTime(c.lastRunAt) : "—"}</td>
                <td className="num">{c.profilesets ?? ""}</td>
                <td className="num">{c.baseline ? Math.round(c.baseline).toLocaleString("ru-RU") : ""}</td>
                <td className="num">{c.elapsedMs ? `${Math.round(c.elapsedMs / 1000)} с` : ""}</td>
                <td
                  style={{ color: !c.supported ? "var(--text-muted)" : c.queued ? "var(--accent)" : c.lastOk === false ? "var(--bad)" : c.stale || c.equipmentChanged ? "var(--warn)" : "var(--ok)" }}
                  title={c.lastMessage ?? c.reason ?? ""}
                >
                  {!c.supported ? c.reason : c.queued ? "в очереди" : c.lastOk === false ? "ошибка" : c.lastOk == null ? "нет сима" : c.equipmentChanged ? "экипировка изменилась" : c.stale ? "устарел" : "свежий"}
                </td>
                <td>
                  {c.supported && (
                    <button disabled={c.queued} onClick={() => run(() => api.simRun({ ids: [c.characterId] }))} style={{ padding: "2px 8px" }}>
                      Симить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
