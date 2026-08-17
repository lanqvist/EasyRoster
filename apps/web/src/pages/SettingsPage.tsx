import { useEffect, useState } from "react";
import { useConfig } from "../lib/config-context";
import { RankPicker } from "../components/RankPicker";
import { WowIntegrationCard } from "../components/WowIntegrationCard";

export function SettingsPage() {
  const { config, save } = useConfig();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<string>(() => localStorage.getItem("easyroster.settingsTab") ?? "guild");
  useEffect(() => localStorage.setItem("easyroster.settingsTab", tab), [tab]);
  const [busy, setBusy] = useState(false);

  const [ranks, setRanks] = useState<number[]>(config?.raiderRanks ?? []);
  const [labels, setLabels] = useState<Record<string, string>>(config?.rankLabels ?? {});
  const [wowPath, setWowPath] = useState(config?.wowRetailPath ?? "");
  const [interval, setInterval_] = useState(config?.sync.intervalMinutes ?? 30);
  const [guidesDays, setGuidesDays] = useState(config?.sync.guidesRefreshDays ?? 7);
  const [autoExport, setAutoExport] = useState(config?.sync.autoExportLua ?? true);
  const [sim, setSim] = useState(() => ({
    enabled: config?.sim.enabled ?? false,
    autoAfterSync: config?.sim.autoAfterSync ?? true,
    fightStyle: config?.sim.fightStyle ?? "Patchwerk",
    targetError: config?.sim.targetError ?? 0.4,
    threads: config?.sim.threads ?? 0,
    raidTracks: config?.sim.raidTracks ?? ["Hero", "Myth"],
    dungeonTracks: config?.sim.dungeonTracks ?? ["Hero"],
    tankWeights: config?.sim.tankWeights ?? { dps: 0.4, dtps: 0.5, hps: 0.1 },
    maxAgeDays: config?.sim.maxAgeDays ?? 7,
    simcPath: config?.sim.simcPath ?? "",
    tierSetName: config?.sim.tierSetName ?? "",
    talentsSource: config?.sim.talentsSource ?? "simc-profile",
  }));
  const [raidDiff, setRaidDiff] = useState(config?.season.raidDifficulty ?? "normal");
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
        sync: { intervalMinutes: interval, guidesRefreshDays: guidesDays, autoExportLua: autoExport },
        sim: sim as any,
        season: { raidDifficulty: raidDiff } as any,
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

  const TABS: Array<[string, string]> = [["guild", "Гильдия и ранги"], ["keys", "Ключи API"], ["sim", "Автосим"], ["local", "Синхронизация"], ["wow", "Интеграция с WoW"]];
  const show = (t: string): React.CSSProperties | undefined => (tab === t ? undefined : { display: "none" });
  return (
    <div>
      <h1>Настройки</h1>
      <div className="row" style={{ marginBottom: 14, gap: 6 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "primary" : undefined} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}

      <div className="card" style={show("guild")}>
        <h2>Гильдия</h2>
        <p>
          <b>{config.guild.name}</b> — {config.guild.realmName} ({config.region.toUpperCase()}), slug{" "}
          <code>{config.guild.realmSlug}/{config.guild.nameSlug}</code>
        </p>
        <button onClick={rerunSetup}>Пройти мастер заново</button>
      </div>

      <div className="card" style={show("guild")}>
        <h2>Ранги рейдеров</h2>
        <RankPicker value={ranks} onChange={setRanks} labels={labels} onLabelsChange={setLabels} />
      </div>

      <div className="card" style={show("keys")}>
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

      <div className="card" style={show("sim")}>
        <h2>Автосим SimulationCraft</h2>
        <div className="grid-2">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={sim.enabled} onChange={(e) => setSim({ ...sim, enabled: e.target.checked })} /> включить автосим
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={sim.autoAfterSync} onChange={(e) => setSim({ ...sim, autoAfterSync: e.target.checked })} /> запускать после синка при смене экипировки
          </label>
          <div className="field">
            <label>Fight style</label>
            <select value={sim.fightStyle} onChange={(e) => setSim({ ...sim, fightStyle: e.target.value as typeof sim.fightStyle })}>
              {["Patchwerk", "HecticAddCleave", "DungeonSlice", "LightMovement", "HeavyMovement"].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Точность (target_error, %)</label>
            <input type="number" step={0.05} min={0.05} max={2} value={sim.targetError} onChange={(e) => setSim({ ...sim, targetError: Number(e.target.value) })} />
            <span className="hint">0.4 — быстро (≈20–60 с/персонаж), 0.2 — как Raidbots</span>
          </div>
          <div className="field">
            <label>Треки рейда</label>
            <div className="row">
              {["Champion", "Hero", "Myth"].map((t) => (
                <label key={t} className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={sim.raidTracks.includes(t as any)} onChange={(e) => setSim({ ...sim, raidTracks: (e.target.checked ? [...sim.raidTracks, t] : sim.raidTracks.filter((x) => x !== t)) as any })} /> {t}
                </label>
              ))}
            </div>
            <span className="hint">Normal → Champion, Heroic → Hero, Mythic → Myth</span>
          </div>
          <div className="field">
            <label>Треки M+</label>
            <div className="row">
              {["Champion", "Hero", "Myth"].map((t) => (
                <label key={t} className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={sim.dungeonTracks.includes(t as any)} onChange={(e) => setSim({ ...sim, dungeonTracks: (e.target.checked ? [...sim.dungeonTracks, t] : sim.dungeonTracks.filter((x) => x !== t)) as any })} /> {t}
                </label>
              ))}
            </div>
            <span className="hint">дроп из ключа — Hero, тайник — Myth</span>
          </div>
          <div className="field">
            <label>Потоков (0 = все минус один)</label>
            <input type="number" min={0} max={64} value={sim.threads} onChange={(e) => setSim({ ...sim, threads: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Сим устаревает через, дней</label>
            <input type="number" min={1} max={60} value={sim.maxAgeDays} onChange={(e) => setSim({ ...sim, maxAgeDays: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Веса для танков (dps / входящий урон / самолечение)</label>
            <div className="row">
              <input type="number" step={0.1} style={{ width: 70 }} value={sim.tankWeights.dps} onChange={(e) => setSim({ ...sim, tankWeights: { ...sim.tankWeights, dps: Number(e.target.value) } })} />
              <input type="number" step={0.1} style={{ width: 70 }} value={sim.tankWeights.dtps} onChange={(e) => setSim({ ...sim, tankWeights: { ...sim.tankWeights, dtps: Number(e.target.value) } })} />
              <input type="number" step={0.1} style={{ width: 70 }} value={sim.tankWeights.hps} onChange={(e) => setSim({ ...sim, tankWeights: { ...sim.tankWeights, hps: Number(e.target.value) } })} />
            </div>
            <span className="hint">итог = dps·w1 − dtps·w2 + hps·w3 (в %). Хилов SimC не считает.</span>
          </div>
          <div className="field">
            <label>Сложность рейда по умолчанию (треки/% в BiS и db.lua)</label>
            <select value={raidDiff} onChange={(e) => setRaidDiff(e.target.value as typeof raidDiff)}>
              <option value="normal">Normal → Champion</option>
              <option value="heroic">Heroic → Hero</option>
              <option value="mythic">Mythic → Myth</option>
            </select>
          </div>
          <div className="field">
            <label>Таланты для сима</label>
            <select value={sim.talentsSource} onChange={(e) => setSim({ ...sim, talentsSource: e.target.value as typeof sim.talentsSource })}>
              <option value="simc-profile">Штатный рейдовый профиль SimC (single-target)</option>
              <option value="character">Таланты персонажа из Blizzard API</option>
            </select>
            <span className="hint">Ручной код талантов в карточке персонажа побеждает в любом случае</span>
          </div>
          <div className="field">
            <label>Имя сет-бонуса в SimC (пусто = авто, напр. mid2)</label>
            <input value={sim.tierSetName} onChange={(e) => setSim({ ...sim, tierSetName: e.target.value })} />
          </div>
          <div className="field">
            <label>Путь к simc.exe (пусто = скачанный автоматически)</label>
            <input value={sim.simcPath} onChange={(e) => setSim({ ...sim, simcPath: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="card" style={show("local")}>
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
          <div className="field">
            <label>Автообновление Icy Veins, дней (0 — выкл.)</label>
            <input type="number" min={0} max={60} value={guidesDays} onChange={(e) => setGuidesDays(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>db.lua для аддона</label>
            <label className="row" style={{ gap: 6, textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--text)" }}>
              <input type="checkbox" checked={autoExport} onChange={(e) => setAutoExport(e.target.checked)} /> перезаписывать автоматически после синка
            </label>
          </div>
        </div>
      </div>

      {tab !== "wow" && (
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
      )}

      <div style={show("wow")}>
        <WowIntegrationCard />
      </div>
    </div>
  );
}
