import { useEffect, useState } from "react";
import type { GuildProbeResult, RealmOption } from "@easyroster/core";
import { api } from "../lib/api";
import { useConfig } from "../lib/config-context";
import { RankPicker } from "../components/RankPicker";
import { applyTheme, getTheme } from "../lib/theme";

const STEPS = ["Blizzard API", "Гильдия", "Ранги", "Путь к WoW"];

const DEFAULT_WOW_PATH = "C:\\Program Files (x86)\\World of Warcraft\\_retail_";

export function SetupPage() {
  const { config, save } = useConfig();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // шаг 1
  const [region, setRegion] = useState(config?.region ?? "eu");
  const [clientId, setClientId] = useState(config?.blizzard.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [realms, setRealms] = useState<RealmOption[] | null>(null);

  // шаг 2
  const [realmSlug, setRealmSlug] = useState(config?.guild.realmSlug ?? "");
  const [guildName, setGuildName] = useState(config?.guild.name ?? "");
  const [probe, setProbe] = useState<GuildProbeResult | null>(null);

  // шаг 3
  const [ranks, setRanks] = useState<number[]>(config?.raiderRanks ?? []);
  const [labels, setLabels] = useState<Record<string, string>>(config?.rankLabels ?? {});

  // шаг 4
  const [wowPath, setWowPath] = useState(config?.wowRetailPath || DEFAULT_WOW_PATH);

  useEffect(() => {
    setErr(null);
  }, [step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const step1Next = () =>
    run(async () => {
      if (!clientId || (!clientSecret && !config?.blizzard.hasSecret)) throw new Error("Введите client id и secret");
      // сначала проверяем ключи запросом к API, сохраняем только при успехе
      const list = await api.realms({ region, clientId, clientSecret });
      await save({ region, blizzard: { clientId, clientSecret } });
      setClientSecret("");
      setRealms(list);
      setStep(1);
    });

  const step2Probe = () =>
    run(async () => {
      if (!realmSlug || !guildName) throw new Error("Выберите реалм и введите название гильдии");
      const res = await api.probeGuild({ region, clientId, realmSlug, guildName });
      setProbe(res);
    });

  const step2Next = () =>
    run(async () => {
      if (!probe) throw new Error("Сначала проверьте гильдию");
      await save({ guild: probe.guild });
      setStep(2);
    });

  const step3Next = () =>
    run(async () => {
      if (ranks.length === 0) throw new Error("Укажите хотя бы один ранг");
      await save({ raiderRanks: ranks, rankLabels: labels });
      setStep(3);
    });

  const finish = () =>
    run(async () => {
      await save({ wowRetailPath: wowPath, setupComplete: true });
    });

  return (
    <div className="main" style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>
          Easy<span style={{ color: "var(--accent)" }}>Roster</span> — первый запуск
        </h1>
        <button className="theme-toggle" onClick={() => { applyTheme(getTheme() === "dark" ? "light" : "dark"); setStep((s) => s); }}>
          ☀/☾ тема
        </button>
      </div>
      <p className="muted">Все данные хранятся локально в папке <code>data/</code>. Ключи наружу не передаются.</p>

      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} className={i === step ? "active" : i < step ? "done" : ""}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {err && <div className="alert bad">{err}</div>}

      {step === 0 && (
        <div className="card">
          <h2>Ключи Blizzard API</h2>
          <p className="muted">
            Создайте клиент на{" "}
            <a href="https://community.developer.battle.net/access/clients" target="_blank" rel="noreferrer">
              community.developer.battle.net
            </a>{" "}
            (нужен аккаунт Battle.net с двухфакторкой). Redirect URL не нужен.
          </p>
          <div className="grid-2">
            <div className="field">
              <label>Регион</label>
              <select value={region} onChange={(e) => setRegion(e.target.value as typeof region)}>
                <option value="eu">EU</option>
                <option value="us">US</option>
                <option value="kr">KR</option>
                <option value="tw">TW</option>
              </select>
            </div>
            <div />
            <div className="field">
              <label>Client ID</label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
            </div>
            <div className="field">
              <label>Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config?.blizzard.hasSecret ? "(сохранён — оставьте пустым)" : ""}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="row">
            <button className="primary" disabled={busy} onClick={step1Next}>
              {busy ? "Проверяю…" : "Проверить и продолжить"}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2>Гильдия</h2>
          <div className="grid-2">
            <div className="field">
              <label>Реалм</label>
              <select value={realmSlug} onChange={(e) => setRealmSlug(e.target.value)}>
                <option value="">— выберите —</option>
                {realms?.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="hint">Для гильдии на связанных реалмах — реалм, где она создана.</span>
            </div>
            <div className="field">
              <label>Название гильдии</label>
              <input value={guildName} onChange={(e) => setGuildName(e.target.value)} placeholder="Стигма" />
            </div>
          </div>
          <div className="row">
            <button onClick={() => setStep(0)}>Назад</button>
            <button disabled={busy} onClick={step2Probe}>
              {busy ? "Ищу…" : "Найти гильдию"}
            </button>
            <button className="primary" disabled={busy || !probe} onClick={step2Next}>
              Продолжить
            </button>
          </div>
          {probe && (
            <div className="alert ok">
              Найдена: <b>{probe.guild.name}</b> — {probe.guild.realmName}, {probe.guild.faction}, участников:{" "}
              {probe.guild.memberCount}. Рангов в ростере: {probe.ranks.length}.
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>Какие ранги — рейдеры</h2>
          <RankPicker value={ranks} onChange={setRanks} probe={probe?.ranks} labels={labels} onLabelsChange={setLabels} />
          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={() => setStep(1)}>Назад</button>
            <button className="primary" disabled={busy} onClick={step3Next}>
              Продолжить
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2>Папка World of Warcraft</h2>
          <div className="field">
            <label>Путь к _retail_</label>
            <input value={wowPath} onChange={(e) => setWowPath(e.target.value)} />
            <span className="hint">
              Нужен для записи <code>Interface\AddOns\RCLootCouncil_EasyRoster\Data\db.lua</code> и чтения{" "}
              <code>WTF\Account\…\SavedVariables</code>. Можно заполнить позже в настройках.
            </span>
          </div>
          <div className="row">
            <button onClick={() => setStep(2)}>Назад</button>
            <button className="primary" disabled={busy} onClick={finish}>
              Завершить настройку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
