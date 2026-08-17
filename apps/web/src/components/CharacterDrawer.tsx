import { useEffect, useState } from "react";
import { SLOT_NAMES_RU, wowheadUrl, EQUIP_SLOT_NAMES_RU, EQUIP_SLOT_ORDER, TRACK_NAMES_RU, iconUrl, type BisCharacterView, type BisEntry, type CharacterDetail } from "@easyroster/core";
import { BisSlotList, SOURCE_LABEL } from "./BisSlotList";
import { api } from "../lib/api";
import { classColor, className, fmtDate, QUALITY_COLORS, QUALITY_COLORS_NUM, ROLE_RU, roleOf, specName } from "../lib/format";
import { useConfig } from "../lib/config-context";

export function CharacterDrawer({ id, onClose, initialTab = "gear" }: { id: number; onClose: () => void; initialTab?: "gear" | "bis" }) {
  const { config } = useConfig();
  const [data, setData] = useState<CharacterDetail | null>(null);
  const [tab, setTab] = useState<"gear" | "bis" | "sim">(initialTab);
  const [bis, setBis] = useState<BisCharacterView | null>(null);
  const [bisErr, setBisErr] = useState<string | null>(null);

  const loadBis = () =>
    api
      .bisCharacter(id)
      .then((v) => {
        setBis(v);
        setBisErr(null);
      })
      .catch((e) => setBisErr((e as Error).message));

  useEffect(() => {
    if (tab === "bis") void loadBis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  const manual = async (e: BisEntry, action: "pin" | "exclude") => {
    if (!bis) return;
    await api.bisManualAdd({ characterId: id, specId: bis.specId, slot: e.slot, itemId: e.itemId, action });
    await loadBis();
  };
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .character(id)
      .then(setData)
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    setData(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const resync = async () => {
    setBusy(true);
    try {
      await api.syncCharacters({ ids: [id], force: true });
      // подождём завершения (один персонаж — секунды)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const s = await api.syncStatus();
        if (!s.running) break;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const c = data?.character;
  const eq = new Map(data?.equipment.map((e) => [e.slot, e]) ?? []);
  const role = c ? roleOf(c.activeSpecId) : null;
  const armory =
    c && config ? `https://worldofwarcraft.blizzard.com/${config.locale === "ru_RU" ? "ru-ru" : "en-gb"}/character/${config.region}/${c.realmSlug}/${encodeURIComponent(c.name.toLowerCase())}` : "#";
  const rio = c && config ? `https://raider.io/characters/${config.region}/${c.realmSlug}/${encodeURIComponent(c.name)}` : "#";
  const wcl = c && config ? `https://www.warcraftlogs.com/character/${config.region}/${c.realmSlug}/${encodeURIComponent(c.name)}` : "#";

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", justifyContent: "flex-end", zIndex: 10 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "100%", height: "100%", overflowY: "auto", background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", padding: 20 }}
      >
        {err && <div className="alert bad">{err}</div>}
        {!c ? (
          <div className="muted">Загрузка…</div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="row" style={{ alignItems: "center" }}>
                {c.avatarUrl && <img src={c.avatarUrl} alt="" width={56} height={56} style={{ borderRadius: 6, border: "1px solid var(--border)" }} />}
                <div>
                  <h2 style={{ marginBottom: 2 }}>
                    <span style={{ color: classColor(c.classId) }}>{c.name}</span>
                    <span className="muted" style={{ fontWeight: 400 }}> — {c.realmName || c.realmSlug}</span>
                  </h2>
                  <div className="muted">
                    {className(c.classId)} · {specName(c.activeSpecId)} {role ? `(${ROLE_RU[role]})` : ""} · ур. {c.level}
                  </div>
                </div>
              </div>
              <button onClick={onClose}>✕</button>
            </div>

            <div className="grid-2" style={{ margin: "14px 0" }}>
              <Stat label="ilvl (надето / средний)" value={c.ilvlEquipped ? `${c.ilvlEquipped.toFixed(1)} / ${c.ilvlAvg?.toFixed(1)}` : "—"} />
              <Stat label="Ранг" value={`${config?.rankLabels[String(c.rank)] || "—"} (${c.rank})`} />
              <Stat label="Последний логаут" value={fmtDate(c.lastLoginMs)} />
              <Stat label="Синк профиля" value={c.profileStatus === "ok" ? fmtDate(c.profileSyncedAt) : `${c.profileStatus}${c.profileMessage ? ": " + c.profileMessage : ""}`} />
            </div>

            <div className="row" style={{ marginBottom: 14 }}>
              <a href={armory} target="_blank" rel="noreferrer">Армори</a>
              <a href={rio} target="_blank" rel="noreferrer">Raider.IO</a>
              <a href={wcl} target="_blank" rel="noreferrer">Warcraft Logs</a>
              <button style={{ marginLeft: "auto" }} disabled={busy} onClick={resync}>
                {busy ? "Обновляю…" : "Обновить из API"}
              </button>
            </div>

            <div className="row" style={{ marginBottom: 10, gap: 6 }}>
              <button className={tab === "gear" ? "primary" : undefined} onClick={() => setTab("gear")}>Экипировка</button>
              <button className={tab === "bis" ? "primary" : undefined} onClick={() => setTab("bis")}>BiS-лист</button>
              <button className={tab === "sim" ? "primary" : undefined} onClick={() => setTab("sim")}>Сим</button>
            </div>
            {tab === "sim" && <SimResults characterId={id} locale={config?.locale ?? "ru_RU"} onChanged={loadBis} />}
            {tab === "bis" && (
              <div>
                {bisErr && <div className="alert bad">{bisErr}</div>}
                {!bis && !bisErr && <div className="muted">Считаю…</div>}
                {bis && (
                  <>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                      Покрытие: <b>{bis.coverage.pct}%</b> ({bis.coverage.obtained} из {bis.coverage.slots} на макс. треке, {bis.coverage.lower} ниже трека/катализатор) ·
                      источники: {bis.sourcesUsed.map((s) => `${SOURCE_LABEL[s.source]} (${s.count})`).join(", ") || "нет — обновите на странице BiS"}
                      {bis.personalSim && <> · сим: {bis.personalSim.label}</>}
                    </div>
                    <SimBox characterId={id} onDone={loadBis} />
                    <DroptimizerBox characterId={id} onImported={loadBis} />
                    <BisSlotList view={bis} locale={config?.locale ?? "ru_RU"} onPin={(e) => manual(e, "pin")} onExclude={(e) => manual(e, "exclude")} />
                    <ManualRules specId={bis.specId} characterId={id} onChange={loadBis} />
                  </>
                )}
              </div>
            )}
            {tab === "gear" && data!.equipment.length === 0 ? (
              <div className="muted">Нет данных об экипировке.</div>
            ) : tab === "gear" ? (
              <table>
                <thead>
                  <tr>
                    <th>Слот</th>
                    <th>Предмет</th>
                    <th className="num">ilvl</th>
                    <th>Трек</th>
                    <th>Энч/камни</th>
                  </tr>
                </thead>
                <tbody>
                  {EQUIP_SLOT_ORDER.filter((s) => s !== "SHIRT" && s !== "TABARD").map((slot) => {
                    const it = eq.get(slot);
                    return (
                      <tr key={slot}>
                        <td className="muted">{EQUIP_SLOT_NAMES_RU[slot]}</td>
                        <td>
                          {it && <img src={iconUrl(it.icon, "small")} width={18} height={18} alt="" style={{ verticalAlign: "middle", marginRight: 6, borderRadius: 3 }} />}
                          {it ? (
                            <a
                              href={`https://www.wowhead.com/ru/item=${it.itemId}${it.bonusIds.length ? `?bonus=${it.bonusIds.join(":")}` : ""}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: QUALITY_COLORS[it.quality ?? ""] ?? "inherit" }}
                              title={it.setName ? `Комплект: ${it.setName}` : undefined}
                            >
                              {it.itemName ?? `#${it.itemId}`}
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">{it?.ilvl ?? ""}</td>
                        <td className="muted" title={it?.track ? `${it.track.name} ${it.track.level}/${it.track.max}` : undefined}>
                          {it?.track ? `${TRACK_NAMES_RU[it.track.name] ?? it.track.name} ${it.track.level}/${it.track.max}` : it?.trackName ?? ""}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {it && (
                            <>
                              {it.enchantId ? "энч" : ""}
                              {it.gems.length ? ` ${it.gems.length}💎` : ""}
                              {it.emptySockets ? <span style={{ color: "var(--warn)" }}> {it.emptySockets} пуст.</span> : ""}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {tab === "gear" && c.talentLoadoutCode && (
              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Код талантов (активный лоадаут)</div>
                <code style={{ wordBreak: "break-all", fontSize: 11 }}>{c.talentLoadoutCode}</code>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

function ManualRules({ specId, characterId, onChange }: { specId: number; characterId: number; onChange: () => void }) {
  const [rules, setRules] = useState<Array<{ id: number; characterId: number | null; slot: string; itemId: number; action: "pin" | "exclude"; note: string | null }>>([]);
  const load = () => api.bisManualList(specId, characterId).then(setRules).catch(() => undefined);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId, characterId]);
  if (rules.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Ручные правки</div>
      {rules.map((r) => (
        <div key={r.id} className="row" style={{ fontSize: 12, gap: 8 }}>
          <span>{r.action === "pin" ? "📌" : "✕"} {EQUIP_SLOT_NAMES_RU[r.slot] ?? r.slot} · #{r.itemId}{r.characterId === null ? " (вся спека)" : ""}</span>
          <button style={{ padding: "0 6px", fontSize: 11 }} onClick={async () => { await api.bisManualDelete(r.id); await load(); onChange(); }}>убрать</button>
        </div>
      ))}
    </div>
  );
}

function SimResults({ characterId, locale, onChanged }: { characterId: number; locale: string; onChanged: () => void }) {
  const [data, setData] = useState<{ report: any; results: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [track, setTrack] = useState<string>("");
  const [slotF, setSlotF] = useState<string>("");
  const load = () => api.simCharacter(characterId).then(setData).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);
  const ru = locale.startsWith("ru");
  const rows = (data?.results ?? []).filter((r) => (!track || r.meta?.track === track) && (!slotF || r.slot === slotF));
  const tracks = [...new Set((data?.results ?? []).map((r) => r.meta?.track).filter(Boolean))] as string[];
  const slots = [...new Set((data?.results ?? []).map((r) => r.slot))] as string[];
  const isTank = data?.results?.[0]?.meta?.role === "tank";
  return (
    <div>
      <SimBox characterId={characterId} onDone={() => { void load(); onChanged(); }} />
      {err && <div className="alert bad">{err}</div>}
      {data && !data.report && <div className="placeholder">Сима ещё не было — нажмите «Симить сейчас».</div>}
      {data?.report && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {data.report.kind === "simc" ? "SimC" : "Droptimizer"} · {fmtDate(data.report.simDate ?? data.report.importedAt)} · база{" "}
            <b className="num">{Math.round(data.report.baselineDps ?? 0).toLocaleString("ru-RU")}</b> dps · {data.report.fightStyle ?? ""} · результатов {data.results.length}
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <select value={track} onChange={(e) => setTrack(e.target.value)}>
              <option value="">Все треки</option>
              {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={slotF} onChange={(e) => setSlotF(e.target.value)}>
              <option value="">Все слоты</option>
              {slots.map((s) => <option key={s} value={s}>{SLOT_NAMES_RU[s] ?? s}</option>)}
            </select>
          </div>
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th></th>
                <th>Предмет</th>
                <th>Слот</th>
                <th>Трек</th>
                <th className="num">{isTank ? "Итог" : "DPS"}</th>
                {isTank && <th className="num">DPS</th>}
                {isTank && <th className="num">Вх. урон</th>}
                {isTank && <th className="num">Самолеч.</th>}
                <th className="num">Δ dps</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = r.meta ?? {};
                const it = r.item;
                const dpsPct = m.base ? (m.delta / m.base) * 100 : r.score;
                const col = (v: number | null | undefined, invert = false) => (v == null ? "inherit" : (invert ? -v : v) > 0.05 ? "var(--ok)" : (invert ? -v : v) < -0.05 ? "var(--bad)" : "var(--text-muted)");
                return (
                  <tr key={r.id}>
                    <td style={{ width: 24, padding: "2px 4px" }}>{it && <img src={iconUrl(it.icon, "small")} width={18} height={18} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} loading="lazy" />}</td>
                    <td>
                      <a href={wowheadUrl(r.itemId, r.bonusIds, ru ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[it?.quality ?? 4] }}>
                        {(ru && it?.nameRu) || it?.name || `#${r.itemId}`}
                      </a>
                      {m.tokenId ? <span className="muted"> · токен</span> : null}
                    </td>
                    <td className="muted">{SLOT_NAMES_RU[r.slot] ?? r.slot}</td>
                    <td className="muted">{m.track}</td>
                    <td className="num" style={{ color: col(r.score), fontWeight: 600 }}>{r.score > 0 ? "+" : ""}{Number(r.score).toFixed(2)}%</td>
                    {isTank && <td className="num" style={{ color: col(dpsPct) }}>{dpsPct > 0 ? "+" : ""}{dpsPct.toFixed(2)}%</td>}
                    {isTank && <td className="num" style={{ color: col(m.dtpsPct, true) }}>{m.dtpsPct != null ? `${m.dtpsPct > 0 ? "+" : ""}${m.dtpsPct.toFixed(2)}%` : "—"}</td>}
                    {isTank && <td className="num" style={{ color: col(m.hpsPct) }}>{m.hpsPct != null ? `${m.hpsPct > 0 ? "+" : ""}${m.hpsPct.toFixed(2)}%` : "—"}</td>}
                    <td className="num muted">{m.delta != null ? `${m.delta > 0 ? "+" : ""}${Math.round(m.delta)}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function SimBox({ characterId, onDone }: { characterId: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [state, setState] = useState<{ stage: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const st = await api.simStatus();
      if (!st.simcPath) throw new Error("SimulationCraft не установлен — страница BiS → «Установить SimC»");
      const r = await api.simRun({ ids: [characterId] });
      if (r.queued === 0) throw new Error("Персонаж не поставлен в очередь (хил / нет спеки / уже в очереди)");
      for (let i = 0; i < 240; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const s = await api.simStatus();
        const me = s.characters.find((c) => c.characterId === characterId);
        if (s.current?.characterId === characterId) setState({ stage: s.current.stage });
        else if (me && !me.queued) {
          setMsg(me.lastOk ? `Сим готов: ${me.profilesets} профильсетов за ${Math.round((me.elapsedMs ?? 0) / 1000)} с` : `Ошибка: ${me.lastMessage}`);
          break;
        } else setState({ stage: `в очереди (${s.queue})` });
      }
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      setState(null);
    }
  };
  return (
    <div className="row" style={{ marginBottom: 8, fontSize: 12 }}>
      <button disabled={busy} onClick={run}>{busy ? (state?.stage ?? "Симлю…") : "Симить сейчас (SimC)"}</button>
      {msg && <span className="muted">{msg}</span>}
    </div>
  );
}

function DroptimizerBox({ characterId, onImported }: { characterId: number; onImported: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sim, setSim] = useState<Awaited<ReturnType<typeof api.bisSim>>>(null);
  useEffect(() => {
    api.bisSim(characterId).then(setSim).catch(() => undefined);
  }, [characterId]);
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.bisDroptimizer(characterId, url);
      setMsg({ ok: true, text: `Импортировано: ${r.results} результатов, ${r.candidates} апгрейдов${r.warning ? ` · ⚠ ${r.warning}` : ""}` });
      setUrl("");
      setSim(await api.bisSim(characterId));
      onImported();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginBottom: 12, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <input placeholder="Ссылка на Raidbots Droptimizer (…/simbot/report/ID)" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <button disabled={busy || !url} onClick={submit}>{busy ? "Импорт…" : "Импорт"}</button>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {sim ? (
          <>
            Последний сим: {fmtDate(sim.importedAt)}{sim.simDate ? ` (сим от ${fmtDate(sim.simDate)})` : ""}
            {sim.url && <> · <a href={sim.url} target="_blank" rel="noreferrer">отчёт</a></>}
            {sim.baselineDps ? ` · база ${Math.round(sim.baselineDps).toLocaleString("ru-RU")}` : ""}
          </>
        ) : (
          "Персональный сим поднимает предметы по % апгрейда; без него — общий лист спеки."
        )}
      </div>
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`} style={{ marginBottom: 0 }}>{msg.text}</div>}
    </div>
  );
}
