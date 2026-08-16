import { useState } from "react";
import { useConfig } from "../lib/config-context";
import { RankPicker } from "../components/RankPicker";

export function SettingsPage() {
  const { config, save } = useConfig();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [ranks, setRanks] = useState<number[]>(config?.raiderRanks ?? []);
  const [labels, setLabels] = useState<Record<string, string>>(config?.rankLabels ?? {});
  const [wowPath, setWowPath] = useState(config?.wowRetailPath ?? "");
  const [interval, setInterval_] = useState(config?.sync.intervalMinutes ?? 30);
  const [bnetId, setBnetId] = useState(config?.blizzard.clientId ?? "");
  const [bnetSecret, setBnetSecret] = useState("");
  const [wclId, setWclId] = useState(config?.warcraftLogs.clientId ?? "");
  const [wclSecret, setWclSecret] = useState("");

  if (!config) return null;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await save({
        raiderRanks: ranks,
        rankLabels: labels,
        wowRetailPath: wowPath,
        sync: { intervalMinutes: interval },
        blizzard: { clientId: bnetId, clientSecret: bnetSecret },
        warcraftLogs: { clientId: wclId, clientSecret: wclSecret },
      });
      setBnetSecret("");
      setWclSecret("");
      setMsg({ ok: true, text: "Сохранено" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rerunSetup = async () => {
    await save({ setupComplete: false });
  };

  return (
    <div>
      <h1>Настройки</h1>
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}

      <div className="card">
        <h2>Гильдия</h2>
        <p>
          <b>{config.guild.name}</b> — {config.guild.realmName} ({config.region.toUpperCase()}), slug{" "}
          <code>{config.guild.realmSlug}/{config.guild.nameSlug}</code>
        </p>
        <button onClick={rerunSetup}>Пройти мастер заново</button>
      </div>

      <div className="card">
        <h2>Ранги рейдеров</h2>
        <RankPicker value={ranks} onChange={setRanks} labels={labels} onLabelsChange={setLabels} />
      </div>

      <div className="card">
        <h2>Ключи API</h2>
        <div className="grid-2">
          <div className="field">
            <label>Blizzard client ID</label>
            <input value={bnetId} onChange={(e) => setBnetId(e.target.value)} />
          </div>
          <div className="field">
            <label>Blizzard client secret</label>
            <input
              type="password"
              value={bnetSecret}
              onChange={(e) => setBnetSecret(e.target.value)}
              placeholder={config.blizzard.hasSecret ? "(сохранён)" : ""}
            />
          </div>
          <div className="field">
            <label>Warcraft Logs client ID</label>
            <input value={wclId} onChange={(e) => setWclId(e.target.value)} />
            <span className="hint">
              <a href="https://www.warcraftlogs.com/api/clients" target="_blank" rel="noreferrer">
                warcraftlogs.com/api/clients
              </a>{" "}
              — понадобится в фазе 3 (BiS по логам).
            </span>
          </div>
          <div className="field">
            <label>Warcraft Logs client secret</label>
            <input
              type="password"
              value={wclSecret}
              onChange={(e) => setWclSecret(e.target.value)}
              placeholder={config.warcraftLogs.hasSecret ? "(сохранён)" : ""}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Локально</h2>
        <div className="grid-2">
          <div className="field">
            <label>Путь к _retail_</label>
            <input value={wowPath} onChange={(e) => setWowPath(e.target.value)} />
          </div>
          <div className="field">
            <label>Автосинк, минут (0 — выкл.)</label>
            <input type="number" min={0} max={1440} value={interval} onChange={(e) => setInterval_(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <button className="primary" disabled={busy} onClick={submit}>
        {busy ? "Сохраняю…" : "Сохранить"}
      </button>
    </div>
  );
}
