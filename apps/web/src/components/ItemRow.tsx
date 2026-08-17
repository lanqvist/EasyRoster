import { TRACK_NAMES_RU, type BisEntry } from "@easyroster/core";
import { ItemLink } from "./ItemLink";
import { Chip, KIND_COLOR, KIND_ICON, KIND_LABEL } from "./SourceChips";
import { OBTAINED_STYLE } from "./BisSlotList";

/**
 * Единая строка предмета-кандидата: [иконка] Название · источник · трек/ilvl · % сима · статус.
 * Используется в карточке персонажа, Распределения лута и Тире.
 */
export function ItemRow({
  e,
  ru,
  showStatus = true,
  showAlt = false,
  dense = false,
  actions,
}: {
  e: BisEntry;
  ru: boolean;
  showStatus?: boolean;
  showAlt?: boolean;
  dense?: boolean;
  actions?: React.ReactNode;
}) {
  const st = OBTAINED_STYLE[e.obtained];
  // для катализируемых предметов показываем босса-источник, а не запись каталога «Catalyst - …»
  const goodDrops = e.drops.filter((d) => d.kind === "raid" || d.kind === "mplus" || d.kind === "world");
  const useDrops = goodDrops.length ? goodDrops : e.drops.filter((d) => !/catalyst/i.test(d.instanceName));
  const src = useDrops.length ? [...new Set(useDrops.map((d) => d.encounterName))].slice(0, 2).join(", ") : e.sources.find((s) => s.note)?.note ?? "";
  const dt = e.dropTrack;
  const sim = e.simSelected;
  const simTip = e.simByTrack ? "сим по трекам:\n" + Object.entries(e.simByTrack).sort((a, b) => b[1] - a[1]).map(([t, v]) => `${TRACK_NAMES_RU[t] ?? t} ${v > 0 ? "+" : ""}${v.toFixed(1)}%`).join("\n") : "";
  const a = e.alternatives;
  const alt = a?.farmable ?? a?.best;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: dense ? "2px 0" : "3px 0", minWidth: 0 }}>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <ItemLink itemId={e.itemId} name={(ru && e.itemNameRu) || e.itemName} icon={e.icon} quality={e.quality} bonusIds={e.bonusIds} ru={ru} size={dense ? 16 : 20} style={{ fontSize: dense ? 12 : 13 }} />
          {e.isTier && <span className="muted" style={{ fontSize: 11 }}>тир</span>}
          <Chip color={KIND_COLOR[e.sourceKind]} title={KIND_LABEL[e.sourceKind]}>
            {KIND_ICON[e.sourceKind]} {src || KIND_LABEL[e.sourceKind]}
          </Chip>
          {dt && <Chip title="Трек и ilvl для выбранной сложности">{TRACK_NAMES_RU[dt.name] ?? dt.name}{dt.ilvl ? ` ${dt.ilvl}` : ""}</Chip>}
        </div>
        {showAlt && alt && (
          <div className="muted" style={{ fontSize: 11 }}>
            альт. {KIND_LABEL[alt.kind]}: {alt.name} {alt.pct > 0 ? "+" : ""}{alt.pct.toFixed(1)}%
            {a?.gap != null && (a.gap > 0.05 ? <span style={{ color: a.gap >= 2 ? "var(--ok)" : a.gap >= 0.8 ? "var(--warn)" : undefined }}> · незаменимость ▲{a.gap.toFixed(1)}</span> : " · заменим")}
          </div>
        )}
      </div>
      <div className="num" style={{ flex: "none", textAlign: "right", fontSize: 12, fontWeight: 600, color: sim ? (sim.pct > 0.05 ? "var(--ok)" : "var(--text-muted)") : "var(--text-muted)", minWidth: 58 }} title={simTip}>
        {sim ? `${sim.pct > 0 ? "+" : ""}${sim.pct.toFixed(1)}%` : e.score ? <span className="muted" style={{ fontWeight: 400 }}>{e.score}</span> : ""}
      </div>
      {showStatus && (
        <div style={{ flex: "none", fontSize: 11, color: st.color, minWidth: 64, textAlign: "right" }} title={e.obtainedDetail ?? ""}>
          {st.label}
        </div>
      )}
      {actions && <div style={{ flex: "none" }}>{actions}</div>}
    </div>
  );
}
