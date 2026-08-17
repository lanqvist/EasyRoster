import { useEffect, useMemo, useRef, useState } from "react";
import { TRACK_NAMES_RU, SLOT_NAMES_RU, iconUrl, wowheadUrl, type InstanceRow, type ItemRow, type ItemWanter, type LootHistoryRow, type LootInstanceView, type StaticDataStatus } from "@easyroster/core";
import { api } from "../lib/api";
import { DifficultySwitch, useDifficulty } from "../lib/difficulty";
import { KIND_LABEL } from "../components/SourceChips";
import { ItemLink } from "../components/ItemLink";
import { useConfig } from "../lib/config-context";
import { classColor, QUALITY_COLORS_NUM, relTime, specName } from "../lib/format";
import { OBTAINED_STYLE } from "../components/BisSlotList";
import { WowIntegrationCard } from "../components/WowIntegrationCard";
import { SlotFocus } from "../components/SlotFocus";

/**
 * Лут-ночь: выбираем рейд → босса → предмет; справа — кому и насколько это нужно
 * (тот же расчёт, что видит совет в RCLootCouncil через колонку BiS). Ниже — свежая история лута RCLC.
 */
export function RaidNightPage() {
  const { difficulty } = useDifficulty();
  const { config } = useConfig();
  const [instances, setInstances] = useState<{ season: StaticDataStatus["season"]; all: InstanceRow[] } | null>(null);
  const [instanceId, setInstanceId] = useState<number | null>(null);
  const [view, setView] = useState<LootInstanceView | null>(null);
  const [encounterId, setEncounterId] = useState<number | null>(null);
  const [wanters, setWanters] = useState<Record<number, ItemWanter[]>>({});
  const [selectedItem, setSelectedItem] = useState<ItemRow | null>(null);
  const [history, setHistory] = useState<LootHistoryRow[]>([]);
  const [focus, setFocus] = useState<{ characterId: number; slot: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyNeeded, setOnlyNeeded] = useState(true);

  useEffect(() => {
    api
      .lootInstances()
      .then((i) => {
        setInstances(i);
        const raid = i.season.raids.find((r) => r.encounters.length > 1) ?? i.season.raids[0];
        if (raid) setInstanceId(raid.id);
      })
      .catch((e) => setErr((e as Error).message));
    api.wowHistory({ limit: 40 }).then(setHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (instanceId === null) return;
    api
      .lootInstance(instanceId)
      .then(async (v) => {
        setView(v);
        setEncounterId(v.encounters[0]?.id ?? null);
        setSelectedItem(null);
        setWanters(await api.bisWanters(v.encounters.flatMap((e) => e.items.map((i) => i.id)), difficulty));
      })
      .catch((e) => setErr((e as Error).message));
  }, [instanceId, difficulty]);

  const enc = view?.encounters.find((e) => e.id === encounterId) ?? null;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const list = itemsRef.current;
      if (!list.length) return;
      ev.preventDefault();
      const idx = selectedItem ? list.findIndex((x) => x.id === selectedItem.id) : -1;
      const next = ev.key === "ArrowDown" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
      setSelectedItem(list[next] ?? null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItem]);
  const items = useMemo(() => {
    if (!enc) return [];
    return enc.items
      .map((it) => ({ it, w: wanters[it.id] ?? [] }))
      .filter((x) => !onlyNeeded || x.w.length > 0)
      .sort((a, b) => b.w.filter((w) => w.obtained !== "yes").length - a.w.filter((w) => w.obtained !== "yes").length);
  }, [enc, wanters, onlyNeeded]);

  const itemsRef = useRef<ItemRow[]>([]);
  itemsRef.current = items.map((x) => x.it);
  const ru = (config?.locale ?? "ru_RU").startsWith("ru");
  const sel = selectedItem ? wanters[selectedItem.id] ?? [] : [];

  return (
    <div className="loot-page">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>Распределение лута</h1>
          <div className="muted" style={{ fontSize: 12 }}>босс → предмет → кому он нужнее и почему (то же, что совет видит в колонке BiS RCLootCouncil)</div>
        </div>
        <DifficultySwitch />
      </div>
      <WowIntegrationCard compact />
      {err && <div className="alert bad">{err}</div>}

      <div className="row" style={{ marginBottom: 10 }}>
        <select value={instanceId ?? ""} onChange={(e) => setInstanceId(Number(e.target.value))}>
          {instances?.season.raids.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
          <optgroup label="Подземелья">
            {instances?.season.dungeons.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </optgroup>
        </select>
        <select value={encounterId ?? ""} onChange={(e) => setEncounterId(Number(e.target.value))}>
          {view?.encounters.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={onlyNeeded} onChange={(e) => setOnlyNeeded(e.target.checked)} /> только нужные кому-то
        </label>
      </div>

      <div className={`loot-grid${focus ? " with-focus" : ""}`}>
        <div className="card" style={{ padding: "8px 12px" }}>
          <h2 style={{ fontSize: 16 }}>{enc?.name ?? "—"}</h2>
          <div className="cand-list">
            {items.map(({ it, w }) => {
              const need = w.filter((x) => x.obtained !== "yes");
              const best = w[0];
              const bestPct = best?.upgradePct ?? null;
              const wanters3 = w.slice(0, 3);
              return (
                <div key={it.id} className={`item-card${selectedItem?.id === it.id ? " active" : ""}`} onClick={() => setSelectedItem(it)}>
                  <div className="item-card-main">
                    <ItemLink itemId={it.id} name={(ru && it.nameRu) || it.name} icon={it.icon} quality={it.quality} ru={ru} size={32} style={{ fontSize: 14, fontWeight: 600 }} />
                    <div className="muted item-card-meta">
                      {it.slot ? SLOT_NAMES_RU[it.slot] : it.contains ? "тир-токен" : ""}
                      {wanters3.length > 0 && (
                        <>
                          {" · "}
                          {wanters3.map((x, i) => (
                            <span key={x.characterId + x.slot}>
                              {i > 0 ? ", " : ""}
                              <span style={{ color: classColor(x.classId) }}>{x.name}</span>
                            </span>
                          ))}
                          {w.length > 3 ? ` +${w.length - 3}` : ""}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="item-card-side">
                    <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                      <span style={{ color: need.length ? "var(--bad)" : "var(--text-muted)" }}>{need.length}</span>
                      <span className="muted" style={{ fontWeight: 400 }}> / {w.length}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{bestPct != null ? `макс. ${bestPct > 0 ? "+" : ""}${bestPct.toFixed(1)}%` : "нужно"}</div>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="muted">{enc ? "Нет предметов, нужных ростеру (или BiS ещё не посчитан)" : "Выберите босса"}</div>}
          </div>
        </div>

        <div className="card" style={{ padding: "8px 12px" }}>
          {selectedItem ? (
            <>
              <h2 style={{ fontSize: 14 }}>
                <ItemLink itemId={selectedItem.id} name={(ru && selectedItem.nameRu) || selectedItem.name} icon={selectedItem.icon} quality={selectedItem.quality} ru={ru} size={30} style={{ fontSize: 17 }} />
              </h2>
              {sel.length === 0 ? (
                <div className="muted">Никому из ростера не в BiS.</div>
              ) : (
                <div className="cand-list">
                  {sel.map((w) => (
                    <CandidateCard key={w.characterId + w.slot} w={w} active={focus?.characterId === w.characterId && focus.slot === w.slot} onClick={() => setFocus({ characterId: w.characterId, slot: w.slot })} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="muted">Выберите предмет слева.</div>
          )}
        </div>
        {focus && (
          <div className="card loot-focus" style={{ padding: "8px 12px", alignSelf: "start", maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button style={{ padding: "0 6px", fontSize: 11 }} onClick={() => setFocus(null)}>✕</button>
            </div>
            <SlotFocus characterId={focus.characterId} slot={focus.slot} highlightItemId={selectedItem?.id} ru={ru} />
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "8px 12px", marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 14 }}>История лута RCLootCouncil (последние)</h2>
          <button onClick={() => api.wowHistory({ limit: 40 }).then(setHistory)}>Обновить</button>
        </div>
        {history.length === 0 ? (
          <div className="muted">Импортируйте историю (кнопка выше) — файлы SavedVariables читаются после /reload или выхода из игры.</div>
        ) : (
          <table style={{ fontSize: 12 }}>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{h.date} {h.time?.slice(0, 5)}</td>
                  <td>{h.playerDisplay}</td>
                  <td>
                    <a href={wowheadUrl(h.itemId, h.bonusIds, ru ? "ru" : "en")} target="_blank" rel="noreferrer">
                      {h.itemLink?.match(/\[(.+?)\]/)?.[1] ?? `#${h.itemId}`}
                    </a>
                  </td>
                  <td className="muted">{h.response}</td>
                  <td className="muted">{h.boss} · {h.instance}</td>
                  <td className="muted">{h.ts ? relTime(h.ts) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


    </div>
  );
}


/** Карточка претендента: полоса статуса слева, имя/спека, слот и место, крупный % сима, альтернатива, gap. */
function CandidateCard({ w, active, onClick }: { w: ItemWanter; active: boolean; onClick: () => void }) {
  const st = OBTAINED_STYLE[w.obtained];
  const pct = w.upgradePct;
  const a = w.alt?.farmable ?? w.alt?.best;
  const gap = w.alt?.gap;
  return (
    <div className={`cand-card${active ? " active" : ""}`} onClick={onClick} style={{ borderLeftColor: st.color }}>
      <div className="cand-main">
        <div className="cand-name">
          <span style={{ color: classColor(w.classId), fontWeight: 700 }}>{w.name}</span>
          <span className="muted"> · {specName(w.specId)}</span>
        </div>
        <div className="cand-meta muted">
          {SLOT_NAMES_RU[w.slot] ?? w.slot} · #{w.rank} в слоте · <span style={{ color: st.color }}>{st.label}</span>
          {w.obtainedDetail ? ` — ${w.obtainedDetail}` : ""}
          {w.equippedIlvl && !w.obtainedDetail ? ` · надето ${w.equippedIlvl}` : ""}
        </div>
        {a && (
          <div className="cand-alt muted">
            {pct == null
              ? `альт. ${KIND_LABEL[a.kind]}: ${a.name}`
              : `без рейда: ${a.name} (${KIND_LABEL[a.kind]}) ${a.pct > 0 ? "+" : ""}${a.pct.toFixed(1)}%`}
          </div>
        )}
      </div>
      <div className="cand-pct">
        <div className="cand-pct-value" style={{ color: pct == null ? "var(--text-muted)" : pct > 0.05 ? "var(--ok)" : pct < -0.05 ? "var(--bad)" : "var(--text-muted)" }}>
          {pct != null ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : w.obtained === "yes" ? "есть" : "—"}
        </div>
        <div className="cand-pct-sub muted">
          {pct != null && w.simTrack ? (TRACK_NAMES_RU[w.simTrack] ?? w.simTrack) : pct == null ? "нет сима" : ""}
        </div>
        {gap != null && pct != null && (
          <div className="cand-gap" style={{ color: gap >= 2 ? "var(--ok)" : gap >= 0.8 ? "var(--warn)" : "var(--text-muted)" }} title="Незаменимость: насколько лучше фармабельной альтернативы">
            {gap > 0.05 ? `▲${gap.toFixed(1)}` : "заменим"}
          </div>
        )}
      </div>
    </div>
  );
}
