import { useEffect, useState } from "react";
import type { SyncStatus } from "@easyroster/core";
import { api } from "../lib/api";
import { relTime } from "../lib/format";

interface Props {
  /** вызывается, когда синк завершился — чтобы страница перезагрузила данные */
  onFinished?: () => void;
}

export function SyncBar({ onFinished }: Props) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wasRunning, setWasRunning] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.syncStatus();
        if (!alive) return;
        setStatus(s);
        if (wasRunning && !s.running) onFinished?.();
        setWasRunning(s.running);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    void tick();
    const id = setInterval(tick, status?.running ? 1000 : 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [status?.running, wasRunning, onFinished]);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      setStatus(await api.syncStatus());
      setWasRunning(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const running = status?.running ?? false;
  const p = status?.progress;

  return (
    <div className="card" style={{ padding: "12px 16px", overflow: "visible" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="split">
          <button className="primary" disabled={running} onClick={() => run(api.syncAll)} title="Ростер гильдии по Blizzard API + профили рейдеров (только изменившиеся, If-Modified-Since). Это же делает автосинк.">
            {running ? "Синхронизация…" : "Обновить"}
          </button>
          <button className="primary split-arrow" disabled={running} title="Другие режимы синхронизации" onClick={() => setMenu((v) => !v)}>▼</button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); void run(api.syncGuild); }}>
                <b>Только ростер гильдии</b>
                <span className="muted">кто в гильдии и с каким рангом; профили не трогаем — быстро, когда приняли/выгнали кого-то</span>
              </button>
              <button onClick={() => { setMenu(false); void run(() => api.syncCharacters({ force: true })); }}>
                <b>Персонажи принудительно</b>
                <span className="muted">перекачать профили всех рейдеров, игнорируя «не изменилось» — если экипировка в карточке явно устарела</span>
              </button>
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
          {running && p && (
            <div>
              {p.done}/{p.total} {p.current ? `— ${p.current}` : ""}
            </div>
          )}
          {!running && status?.lastCharSync && (
            <div title={status.lastCharSync.message}>
              Персонажи: {relTime(status.lastCharSync.at)} {status.lastCharSync.ok ? "" : "⚠"}
            </div>
          )}
          {!running && status?.lastGuildSync && (
            <div title={status.lastGuildSync.message}>
              Ростер: {relTime(status.lastGuildSync.at)} {status.lastGuildSync.ok ? "" : "⚠"}
            </div>
          )}
          {status?.nextAutoSyncAt && !running && <div>Автосинк через {Math.max(0, Math.round((status.nextAutoSyncAt - Date.now()) / 60000))} мин</div>}
        </div>
      </div>
      {running && p && p.total > 0 && (
        <div style={{ height: 3, background: "var(--bg)", marginTop: 8, borderRadius: 2 }}>
          <div style={{ height: 3, width: `${(p.done / p.total) * 100}%`, background: "var(--accent)", borderRadius: 2, transition: "width .3s" }} />
        </div>
      )}
      {err && <div className="alert bad">{err}</div>}
      {!running && status?.lastGuildSync && !status.lastGuildSync.ok && status.lastGuildSync.message !== err && (
        <div className="alert bad">{status.lastGuildSync.message}</div>
      )}
    </div>
  );
}
