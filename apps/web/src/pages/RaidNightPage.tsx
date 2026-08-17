import { useEffect, useMemo, useRef, useState } from "react";
import { RAID_DIFFICULTY_LABEL, TRACK_NAMES_RU, SLOT_NAMES_RU, compareWantersByBenefit, wanterBenefit, wanterNeeds, type InstanceRow, type ItemRow, type ItemWanter, type LootInstanceView, type StaticDataStatus } from "@easyroster/core";
import { api } from "../lib/api";
import { TrackBreakdown, useDifficulty } from "../lib/difficulty";
import { KIND_LABEL } from "../components/SourceChips";
import { ItemIcon, ItemLink } from "../components/ItemLink";
import { ClassIcon } from "../components/ClassIcon";
import { useConfig } from "../lib/config-context";
import { classColor, specName } from "../lib/format";
import { OBTAINED_STYLE } from "../components/BisSlotList";
import { WowIntegrationCard } from "../components/WowIntegrationCard";
import { SlotFocus } from "../components/SlotFocus";
import { AltKinds } from "../components/AltKinds";

type SortMode = "benefit" | "gap" | "rank";
const SORT_LABEL: Record<SortMode, string> = { benefit: "по выгоде", gap: "по незаменимости", rank: "по месту в листе" };
const SORT_TITLE: Record<SortMode, string> = {
  benefit: "% сима на выбранной сложности; без сима — по разнице ilvl и месту в листе; уже имеющие — в конце",
  gap: "▲ насколько выпавшее лучше того, что персонаж может нафармить сам (M+/крафт)",
  rank: "место предмета в BiS-листе слота персонажа (как в гайдах)",
};
const isYes = (w: ItemWanter) => (w.obtained === "yes" ? 1 : 0);
const SORTERS: Record<SortMode, (a: ItemWanter, b: ItemWanter) => number> = {
  benefit: compareWantersByBenefit,
  gap: (a, b) => isYes(a) - isYes(b) || (b.alt?.gap ?? -1e9) - (a.alt?.gap ?? -1e9) || compareWantersByBenefit(a, b),
  rank: (a, b) => isYes(a) - isYes(b) || a.rank - b.rank || compareWantersByBenefit(a, b),
};

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
  const [focus, setFocus] = useState<{ characterId: number; slot: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>(() => (localStorage.getItem("easyroster.raidSort") as SortMode | null) ?? "benefit");
  useEffect(() => localStorage.setItem("easyroster.raidSort", sortMode), [sortMode]);

  useEffect(() => {
    api
      .lootInstances()
      .then((i) => {
        setInstances(i);
        const raid = i.season.raids.find((r) => r.encounters.length > 1) ?? i.season.raids[0];
        if (raid) setInstanceId(raid.id);
      })
      .catch((e) => setErr((e as Error).message));
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
    const needN = (w: ItemWanter[]) => w.filter(wanterNeeds).length;
    const maxB = (w: ItemWanter[]) => Math.max(-Infinity, ...w.map(wanterBenefit));
    return enc.items
      .map((it) => ({ it, w: wanters[it.id] ?? [] }))
      .filter((x) => !onlyNeeded || needN(x.w) > 0)
      .sort((a, b) => needN(b.w) - needN(a.w) || maxB(b.w) - maxB(a.w));
  }, [enc, wanters, onlyNeeded]);

  const itemsRef = useRef<ItemRow[]>([]);
  itemsRef.current = items.map((x) => x.it);
  const ru = (config?.locale ?? "ru_RU").startsWith("ru");
  const sel = useMemo(() => {
    const list = selectedItem ? [...(wanters[selectedItem.id] ?? [])] : [];
    return list.sort(SORTERS[sortMode]);
  }, [selectedItem, wanters, sortMode]);

  return (
    <div className="loot-page">
      <div>
        <h1 style={{ marginBottom: 0 }}>Распределение лута</h1>
        <div className="muted" style={{ fontSize: 12 }}>босс → предмет → кому он нужнее и почему (то же, что совет видит в колонке BiS RCLootCouncil) · сложность — {RAID_DIFFICULTY_LABEL[difficulty]} (переключатель в меню слева)</div>
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
          <input type="checkbox" checked={onlyNeeded} onChange={(e) => setOnlyNeeded(e.target.checked)} /> только апгрейды
        </label>
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>претенденты:</span>
        {(Object.keys(SORT_LABEL) as SortMode[]).map((k) => (
          <button key={k} className={sortMode === k ? "primary" : undefined} style={{ padding: "2px 10px", fontSize: 12 }} title={SORT_TITLE[k]} onClick={() => setSortMode(k)}>{SORT_LABEL[k]}</button>
        ))}
        <span className="muted" style={{ fontSize: 11 }} title="стрелки ↑/↓ переключают предметы">↑↓</span>
      </div>

      <div className={`loot-grid${focus ? " with-focus" : ""}`}>
        <div className="card" style={{ padding: "8px 12px" }}>
          <h2 style={{ fontSize: 16 }}>{enc?.name ?? "—"}</h2>
          <div className="cand-list">
            {items.map(({ it, w }) => {
              const need = w.filter(wanterNeeds);
              const withSim = w.filter((x) => x.upgradePct != null);
              const bestPct = withSim.length ? Math.max(...withSim.map((x) => x.upgradePct!)) : null;
              const wanters3 = need.slice(0, 3);
              return (
                <div key={it.id} className={`item-card${selectedItem?.id === it.id ? " active" : ""}`} onClick={() => setSelectedItem(it)}>
                  <ItemIcon itemId={it.id} icon={it.icon} size={36} />
                  <div className="item-card-main">
                    <ItemLink itemId={it.id} name={(ru && it.nameRu) || it.name} quality={it.quality} ru={ru} style={{ fontSize: 14, fontWeight: 600 }} />
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
                          {need.length > 3 ? ` +${need.length - 3}` : ""}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="item-card-side">
                    <div className="num" style={{ fontSize: 15, fontWeight: 700 }} title={`апгрейд для ${need.length} из ${w.length} претендентов в BiS-листах`}>
                      <span style={{ color: need.length ? "var(--ok)" : "var(--text-muted)" }}>{need.length}</span>
                      <span className="muted" style={{ fontWeight: 400 }}> / {w.length}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {bestPct != null ? (bestPct > 0.05 ? `макс. +${bestPct.toFixed(1)}%` : "никому не апгрейд") : need.length ? "апгрейд" : "не нужен"}
                    </div>
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



    </div>
  );
}


/** Карточка претендента: полоса статуса слева, имя/спека, слот и место, крупный % сима, альтернативы по типам контента, gap. */
function CandidateCard({ w, active, onClick }: { w: ItemWanter; active: boolean; onClick: () => void }) {
  const st = OBTAINED_STYLE[w.obtained];
  const pct = w.upgradePct;
  const a = w.alt?.farmable ?? w.alt?.best;
  const gap = w.alt?.gap;
  const d = w.ilvlDelta ?? null;
  return (
    <div className={`cand-card${active ? " active" : ""}`} onClick={onClick} style={{ borderLeftColor: st.color }}>
      <div className="cand-main">
        <div className="cand-name">
          <ClassIcon classId={w.classId} size={18} /><span style={{ color: classColor(w.classId), fontWeight: 700 }}>{w.name}</span>
          <span className="muted"> · {specName(w.specId)}</span>
        </div>
        <div className="cand-meta muted">
          {SLOT_NAMES_RU[w.slot] ?? w.slot} · #{w.rank} в слоте · <span style={{ color: st.color }}>{st.label}</span>
          {w.obtainedDetail ? ` — ${w.obtainedDetail}` : ""}
          {w.equippedIlvl && !w.obtainedDetail ? ` · надето ${w.equippedIlvl}` : ""}
        </div>
        {w.alt?.byKind ? (
          <AltKinds byKind={w.alt.byKind} own={pct} />
        ) : a ? (
          <div className="cand-alt muted">
            {pct == null
              ? `альт. ${KIND_LABEL[a.kind]}: ${a.name}`
              : `без рейда: ${a.name} (${KIND_LABEL[a.kind]}) ${a.pct > 0 ? "+" : ""}${a.pct.toFixed(1)}%`}
          </div>
        ) : null}
      </div>
      <div className="cand-pct">
        {pct != null ? (
          <div className="cand-pct-value" style={{ color: pct > 0.05 ? "var(--ok)" : pct < -0.05 ? "var(--bad)" : "var(--text-muted)" }}>
            {`${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
          </div>
        ) : w.obtained === "yes" ? (
          <div className="cand-pct-value" style={{ color: "var(--text-muted)" }}>есть</div>
        ) : d != null ? (
          <div className="cand-pct-value" style={{ color: d > 0 ? "var(--ok)" : d < 0 ? "var(--bad)" : "var(--text-muted)" }} title="разница ilvl предмета на выбранной сложности и худшего надетого в слоте (сима нет — оценка по ilvl)">
            {`${d > 0 ? "+" : ""}${d} ilvl`}
          </div>
        ) : (
          <div className="cand-pct-value" style={{ color: "var(--text-muted)" }}>—</div>
        )}
        <div className="cand-pct-sub muted">
          {pct != null && w.simTrack ? (TRACK_NAMES_RU[w.simTrack] ?? w.simTrack) : pct == null ? (d != null ? "по ilvl · нет сима" : "нет сима") : ""}
        </div>
        {w.simByTrack && <TrackBreakdown byTrack={w.simByTrack} active={w.simTrack} />}
        {gap != null && pct != null && (
          <div className="cand-gap" style={{ color: gap >= 2 ? "var(--ok)" : gap >= 0.8 ? "var(--warn)" : "var(--text-muted)" }} title="Незаменимость: насколько лучше фармабельной альтернативы">
            {gap > 0.05 ? `▲${gap.toFixed(1)}` : "заменим"}
          </div>
        )}
      </div>
    </div>
  );
}
