import { useState } from "react";
import { BIS_SLOT_ORDER, SLOT_NAMES_RU, SLOT_TO_EQUIP_SLOTS, TRACK_NAMES_RU, type BisCharacterView, type BisEntry, type CharacterDetail } from "@easyroster/core";
import { ItemIcon, ItemLink } from "./ItemLink";
import { KIND_ICON, KIND_LABEL } from "./SourceChips";
import { OBTAINED_STYLE } from "./BisSlotList";
import { TrackBreakdown } from "../lib/difficulty";

const QUALITY_NUM_BY_TYPE: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };
const pctText = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const pctColor = (v: number | null | undefined) => (v == null ? "var(--text-muted)" : v > 0.05 ? "var(--ok)" : v < -0.05 ? "var(--bad)" : "var(--text-muted)");

function shortSource(e: BisEntry): string {
  const good = e.drops.filter((d) => d.kind === "raid" || d.kind === "mplus" || d.kind === "world");
  const use = good.length ? good : e.drops.filter((d) => !/catalyst|катализ/i.test(d.instanceName));
  const enc = [...new Set(use.map((d) => d.encounterName))].slice(0, 2).join(", ");
  if (e.sourceKind === "catalyst") return `Катализатор${enc ? ` ← ${enc}` : ""}`;
  return enc ? `${KIND_LABEL[e.sourceKind]} · ${enc}` : KIND_LABEL[e.sourceKind];
}

function shortTrack(t: string | null | undefined): string {
  if (!t) return "";
  if (/изготовлен|crafted/i.test(t)) return "Крафт";
  return t.length > 16 ? t.slice(0, 15) + "…" : t;
}

/** Карточка кандидата (в стиле распределения лута). */
function CandidateCard({ e, ru, onPin, onExclude }: { e: BisEntry; ru: boolean; onPin?: (e: BisEntry) => void; onExclude?: (e: BisEntry) => void }) {
  const st = OBTAINED_STYLE[e.obtained];
  const dt = e.dropTrack;
  const a = e.alternatives;
  const alt = a?.farmable ?? a?.best;
  const pct = e.simSelected?.pct;
  const simTip = e.simByTrack ? "сим по трекам:\n" + Object.entries(e.simByTrack).sort((x, y) => y[1] - x[1]).map(([t, v]) => `${TRACK_NAMES_RU[t] ?? t} ${pctText(v)}`).join("\n") : "";
  return (
    <div className="cand-card bis-cand" style={{ borderLeftColor: st.color, cursor: "default" }}>
      <ItemIcon itemId={e.itemId} icon={e.icon} size={30} />
      <div className="cand-main">
        <div className="cand-name" style={{ fontSize: 14 }}>
          <ItemLink itemId={e.itemId} name={(ru && e.itemNameRu) || e.itemName} quality={e.quality} bonusIds={e.bonusIds} ru={ru} style={{ fontWeight: 600 }} />
          {e.isTier && <span className="muted" style={{ fontSize: 11 }}> тир</span>}
        </div>
        <div className="cand-meta muted">
          {KIND_ICON[e.sourceKind]} {shortSource(e)}
          {dt ? ` · ${TRACK_NAMES_RU[dt.name] ?? dt.name}${dt.ilvl ? ` ${dt.ilvl}` : ""}` : ""}
          {e.bisTrack && e.bisTrack.name !== dt?.name ? ` · BiS на ${TRACK_NAMES_RU[e.bisTrack.name] ?? e.bisTrack.name}` : ""}
        </div>
        {alt && e.rank <= 2 && (
          <div className="cand-alt muted" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span>без рейда:</span>
            <ItemLink itemId={alt.itemId} name={alt.name} icon={alt.icon ?? null} quality={alt.quality} bonusIds={alt.bonusIds ?? []} ru={ru} size={14} muted style={{ fontSize: 12 }} />
            <span>({KIND_LABEL[alt.kind]}) {pct != null ? pctText(alt.pct) : `балл ${Math.round(alt.pct)}`}</span>
            {a?.gap != null && (a.gap > 0.05 ? <span style={{ color: a.gap >= 2 ? "var(--ok)" : a.gap >= 0.8 ? "var(--warn)" : undefined }}>· ▲{a.gap.toFixed(1)}</span> : <span>· заменим</span>)}
          </div>
        )}
      </div>
      <div className="cand-pct">
        <div className="cand-pct-value" style={{ color: pctColor(pct), fontSize: 18 }} title={simTip}>
          {pct != null ? pctText(pct) : <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>балл {e.score}</span>}
        </div>
        <div className="cand-pct-sub" style={{ color: st.color }} title={e.obtainedDetail ?? ""}>{st.label}</div>
        {(e.sourceKind === "raid" || e.sourceKind === "catalyst" || e.sourceKind === "world") && <div><TrackBreakdown byTrack={e.simByTrack} active={e.simSelected?.track} /></div>}
      </div>
      {(onPin || onExclude) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "none" }}>
          {onPin && <button style={{ padding: "0 5px", fontSize: 11 }} title="Закрепить сверху" onClick={() => onPin(e)}>📌</button>}
          {onExclude && <button style={{ padding: "0 5px", fontSize: 11 }} title="Убрать из списка" onClick={() => onExclude(e)}>✕</button>}
        </div>
      )}
    </div>
  );
}

/** «Надето ↔ BiS» по слотам: слева надетое (карточка), справа карточки кандидатов (2 + «ещё»). */
export function SlotCompare({
  detail,
  bis,
  ru,
  onPin,
  onExclude,
  perSlot = 2,
}: {
  detail: CharacterDetail;
  bis: BisCharacterView | null;
  ru: boolean;
  onPin?: (e: BisEntry) => void;
  onExclude?: (e: BisEntry) => void;
  perSlot?: number;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const eqBySlot = new Map(detail.equipment.map((e) => [e.slot, e]));
  const bisBySlot = new Map((bis?.slots ?? []).map((s) => [s.slot, s]));

  return (
    <div className="slot-compare">
      {BIS_SLOT_ORDER.map((slot) => {
        const equipSlots = SLOT_TO_EQUIP_SLOTS[slot] ?? [slot];
        const equipped = equipSlots.map((s) => eqBySlot.get(s)).filter((x): x is NonNullable<typeof x> => !!x);
        const view = bisBySlot.get(slot);
        const entries = view?.entries ?? [];
        const open = !!expanded[slot];
        const shown = open ? entries : entries.slice(0, perSlot);
        const best = entries[0];
        const bestSt = best ? OBTAINED_STYLE[best.obtained] : null;
        return (
          <div key={slot} className="slot-block">
            <div className="slot-block-head">
              <span className="slot-block-title">{SLOT_NAMES_RU[slot] ?? slot}</span>
              {bestSt && <span style={{ color: bestSt.color, fontSize: 12 }}>{bestSt.label}</span>}
            </div>
            <div className="slot-block-body">
              <div className="slot-equipped">
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Надето</div>
                {equipped.length === 0 && <div className="muted" style={{ fontSize: 13 }}>— пусто</div>}
                {equipped.map((it) => (
                  <div key={it.slot} className="cand-card" style={{ borderLeftColor: "var(--border)", cursor: "default", marginBottom: 6 }}>
                    <ItemIcon itemId={it.itemId} icon={it.icon} size={30} />
                    <div className="cand-main">
                      <div className="cand-name" style={{ fontSize: 14 }}>
                        <ItemLink itemId={it.itemId} name={it.itemName ?? `#${it.itemId}`} quality={QUALITY_NUM_BY_TYPE[it.quality ?? ""] ?? 4} bonusIds={it.bonusIds} ru={ru} style={{ fontWeight: 600 }} />
                      </div>
                      <div className="cand-meta muted" title={it.trackName ?? ""}>
                        {it.track ? `${TRACK_NAMES_RU[it.track.name] ?? it.track.name} ${it.track.level}/${it.track.max}` : shortTrack(it.trackName)}
                        {it.emptySockets > 0 && <span style={{ color: "var(--warn)" }}> · ◇{it.emptySockets} пустой сокет</span>}
                        {it.setName ? ` · ${it.setName}` : ""}
                      </div>
                    </div>
                    <div className="cand-pct">
                      <div className="cand-pct-value" style={{ fontSize: 18 }}>{it.ilvl ?? "?"}</div>
                      <div className="cand-pct-sub muted">ilvl</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="slot-cands">
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>BiS-кандидаты · сим для выбранной сложности</div>
                {entries.length === 0 && <div className="muted" style={{ fontSize: 13 }}>нет кандидатов</div>}
                <div className="cand-list">
                  {shown.map((e) => (
                    <CandidateCard key={e.itemId} e={e} ru={ru} onPin={onPin} onExclude={onExclude} />
                  ))}
                </div>
                {entries.length > perSlot && (
                  <button className="muted" style={{ border: "none", background: "none", padding: "4px 0", fontSize: 12, cursor: "pointer" }} onClick={() => setExpanded({ ...expanded, [slot]: !open })}>
                    {open ? "свернуть" : `ещё ${entries.length - perSlot}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
