import { useState } from "react";
import { BIS_SLOT_ORDER, SLOT_NAMES_RU, SLOT_TO_EQUIP_SLOTS, TRACK_NAMES_RU, type BisCharacterView, type BisEntry, type CharacterDetail } from "@easyroster/core";
import { ItemLink } from "./ItemLink";
import { ItemRow } from "./ItemRow";
import { OBTAINED_STYLE } from "./BisSlotList";

const QUALITY_NUM_BY_TYPE: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };

/**
 * «Надето ↔ BiS» по слотам в одной таблице: слева экипировка, справа лучшие кандидаты (2 + «ещё»).
 */
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
      <div className="slot-compare-head muted">
        <div>Слот</div>
        <div>Надето</div>
        <div>BiS-кандидаты · сим для выбранной сложности · статус</div>
      </div>
      {BIS_SLOT_ORDER.map((slot) => {
        const equipSlots = SLOT_TO_EQUIP_SLOTS[slot] ?? [slot];
        const equipped = equipSlots.map((s) => eqBySlot.get(s)).filter((x): x is NonNullable<typeof x> => !!x);
        const view = bisBySlot.get(slot);
        const entries = view?.entries ?? [];
        const open = !!expanded[slot];
        const shown = open ? entries : entries.slice(0, perSlot);
        const best = entries[0];
        const rowBg = best ? OBTAINED_STYLE[best.obtained].bg : undefined;
        return (
          <div key={slot} className="slot-compare-row" style={{ background: rowBg }}>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", paddingTop: 6 }}>{SLOT_NAMES_RU[slot] ?? slot}</div>
            <div style={{ paddingTop: 3 }}>
              {equipped.length === 0 && <span className="muted" style={{ fontSize: 12 }}>—</span>}
              {equipped.map((it) => (
                <div key={it.slot} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", minWidth: 0 }}>
                  <ItemLink itemId={it.itemId} name={it.itemName ?? `#${it.itemId}`} icon={it.icon} quality={QUALITY_NUM_BY_TYPE[it.quality ?? ""] ?? 4} bonusIds={it.bonusIds} ru={ru} size={18} style={{ fontSize: 12, minWidth: 0 }} />
                  <span className="num muted" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={it.track ? `${it.track.name} ${it.track.level}/${it.track.max}` : it.trackName ?? ""}>
                    {it.ilvl ?? "?"}{it.track ? ` · ${TRACK_NAMES_RU[it.track.name] ?? it.track.name} ${it.track.level}/${it.track.max}` : ""}
                  </span>
                  {it.emptySockets > 0 && <span style={{ color: "var(--warn)", fontSize: 11 }} title="пустой сокет">◇{it.emptySockets}</span>}
                </div>
              ))}
            </div>
            <div>
              {entries.length === 0 && <span className="muted" style={{ fontSize: 12 }}>нет кандидатов</span>}
              {shown.map((e) => (
                <ItemRow
                  key={e.itemId}
                  e={e}
                  ru={ru}
                  showAlt={e.rank <= 2}
                  actions={
                    (onPin || onExclude) && (
                      <span style={{ whiteSpace: "nowrap" }}>
                        {onPin && <button style={{ padding: "0 5px", fontSize: 11 }} title="Закрепить сверху" onClick={() => onPin(e)}>📌</button>}{" "}
                        {onExclude && <button style={{ padding: "0 5px", fontSize: 11 }} title="Убрать из списка" onClick={() => onExclude(e)}>✕</button>}
                      </span>
                    )
                  }
                />
              ))}
              {entries.length > perSlot && (
                <button className="muted" style={{ border: "none", background: "none", padding: "2px 0", fontSize: 11, cursor: "pointer" }} onClick={() => setExpanded({ ...expanded, [slot]: !open })}>
                  {open ? "свернуть" : `ещё ${entries.length - perSlot}`}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
