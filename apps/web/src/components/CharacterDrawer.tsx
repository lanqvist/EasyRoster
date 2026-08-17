import { useEffect, useState } from "react";
import { SPECS, SLOT_NAMES_RU, wowheadUrl, EQUIP_SLOT_NAMES_RU, EQUIP_SLOT_ORDER, TRACK_NAMES_RU, iconUrl, type BisCharacterView, type BisEntry, type CharacterDetail } from "@easyroster/core";
import { BisSlotList, SOURCE_LABEL } from "./BisSlotList";
import { api } from "../lib/api";
import { classColor, className, fmtDate, QUALITY_COLORS, QUALITY_COLORS_NUM, ROLE_RU, roleOf, specName } from "../lib/format";
import { useConfig } from "../lib/config-context";
import { ItemLink } from "./ItemLink";
import { CharacterView } from "./CharacterView";

const QUALITY_NUM_BY_TYPE: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };
import { DifficultySwitch, useDifficulty } from "../lib/difficulty";

export function CharacterDrawer({ id, onClose }: { id: number; onClose: () => void; initialTab?: "gear" | "bis" }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", justifyContent: "flex-end", zIndex: 10 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1200px, 96vw)", height: "100%", overflowY: "auto", background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", padding: "0 20px 20px" }}>
        <CharacterView id={id} onClose={onClose} layout="drawer" />
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export function ManualRules({ specId, characterId, onChange }: { specId: number; characterId: number; onChange: () => void }) {
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

export function RaidSpecBox({ character, onSaved }: { character: CharacterDetail["character"]; onSaved: () => void }) {
  const [raidSpec, setRaidSpec] = useState<number | "">(character.raidSpecId ?? "");
  const [talents, setTalents] = useState(character.talentsOverride ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const specs = SPECS.filter((s) => s.classId === character.classId);
  const changed = (raidSpec === "" ? null : raidSpec) !== character.raidSpecId || (talents.trim() || null) !== (character.talentsOverride ?? null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.characterSettings(character.id, { raidSpecId: raidSpec === "" ? null : raidSpec, talentsOverride: talents.trim() || null });
      setMsg("Сохранено — BiS пересчитан, сим поставится в очередь при следующем запуске");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ padding: "8px 12px", marginBottom: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Рейдовая спека</label>
          <select value={raidSpec} onChange={(e) => setRaidSpec(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">как в API ({specName(character.detectedSpecId)})</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.id === character.detectedSpecId ? " (в API)" : ""}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
          <label>Таланты для сима (код из игры; пусто = по настройке)</label>
          <input value={talents} onChange={(e) => setTalents(e.target.value)} placeholder="C4QA…" style={{ fontFamily: "var(--mono)", fontSize: 11 }} />
        </div>
        <button className={changed ? "primary" : undefined} disabled={busy || !changed} onClick={save}>Сохранить</button>
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{msg}</div>}
    </div>
  );
}

export function SimResults({ characterId, locale, onChanged }: { characterId: number; locale: string; onChanged: () => void }) {
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
                    <td>
                      <ItemLink itemId={r.itemId} name={(ru && it?.nameRu) || it?.name || `#${r.itemId}`} icon={it?.icon} quality={it?.quality} bonusIds={r.bonusIds} ru={ru} size={18} />
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

export function SimBox({ characterId, onDone }: { characterId: number; onDone: () => void }) {
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

export function DroptimizerBox({ characterId, onImported }: { characterId: number; onImported: () => void }) {
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
