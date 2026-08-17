import { TRACK_NAMES_RU, type BisEntry, type SourceKind } from "@easyroster/core";

export const KIND_LABEL: Record<SourceKind, string> = {
  raid: "Рейд",
  mplus: "M+",
  vault: "Тайник",
  catalyst: "Катализатор",
  craft: "Крафт",
  world: "Мир. босс",
  other: "Другое",
};
export const KIND_ICON: Record<SourceKind, string> = { raid: "🗡", mplus: "🔑", vault: "🎁", catalyst: "⚗", craft: "🔨", world: "🌍", other: "•" };
export const KIND_COLOR: Record<SourceKind, string> = {
  raid: "#c9803a",
  mplus: "#3f9bd1",
  vault: "#a06fd6",
  catalyst: "#3fb8a8",
  craft: "#8a8f9c",
  world: "#7fa64f",
  other: "var(--text-muted)",
};

export function Chip({ children, color, title }: { children: React.ReactNode; color?: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        fontSize: 11,
        lineHeight: "16px",
        padding: "0 6px",
        borderRadius: 999,
        border: `1px solid ${color ?? "var(--border)"}`,
        color: color ?? "var(--text-muted)",
        marginRight: 4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function trackText(t: { name: string; ilvl: number | null } | null): string {
  if (!t) return "";
  return `${TRACK_NAMES_RU[t.name] ?? t.name}${t.ilvl ? ` ${t.ilvl}` : ""}`;
}

/** Чипы: источник (тип + босс/подземелье), трек дропа для выбранной сложности, надетое, Δ ilvl. */
export function SourceChips({ e, showEquipped = true }: { e: BisEntry; showEquipped?: boolean }) {
  const kind = e.sourceKind;
  const src = e.drops.length
    ? [...new Set(e.drops.map((d) => d.encounterName))].slice(0, 2).join(", ") + (e.drops.length > 2 ? "…" : "")
    : e.sources.find((s) => s.note)?.note ?? "";
  const dropT = e.dropTrack;
  const eq = e.equippedBest;
  const dIlvl = dropT?.ilvl && eq?.ilvl ? dropT.ilvl - eq.ilvl : null;
  return (
    <span>
      <Chip color={KIND_COLOR[kind]} title={KIND_LABEL[kind]}>
        {KIND_ICON[kind]} {KIND_LABEL[kind]}
        {src ? ` · ${src}` : ""}
      </Chip>
      {dropT && <Chip title="Трек и ilvl для выбранной сложности">{trackText(dropT)}</Chip>}
      {e.bisTrack && e.bisTrack.name !== dropT?.name && <Chip title="Трек, на котором предмет BiS по гайду">BiS на {trackText(e.bisTrack)}</Chip>}
      {showEquipped && eq && (
        <Chip title="Лучшее из надетого в слоте">
          надето {eq.track ? `${TRACK_NAMES_RU[eq.track] ?? eq.track} ` : ""}
          {eq.ilvl ?? "?"}
          {dIlvl != null && dIlvl !== 0 ? (
            <span style={{ color: dIlvl > 0 ? "var(--ok)" : "var(--bad)" }}> ({dIlvl > 0 ? "+" : ""}{dIlvl})</span>
          ) : null}
        </Chip>
      )}
    </span>
  );
}

/** Строка про альтернативы: «альт: Vile Vial (M+) +2.5% · gap ▲0.4». */
export function AltLine({ e }: { e: BisEntry }) {
  const a = e.alternatives;
  if (!a || (!a.best && !a.farmable)) return null;
  const f = a.farmable ?? a.best!;
  const gapColor = a.gap == null ? "var(--text-muted)" : a.gap >= 2 ? "var(--ok)" : a.gap >= 0.8 ? "var(--warn)" : "var(--text-muted)";
  return (
    <div className="muted" style={{ fontSize: 11 }} title={a.best && a.best !== f ? `Лучшая из любого источника: ${a.best.name} (${KIND_LABEL[a.best.kind]}) ${a.best.pct > 0 ? "+" : ""}${a.best.pct.toFixed(1)}%` : undefined}>
      альт: {f.name} ({KIND_LABEL[f.kind]}{f.sourceName ? ` · ${f.sourceName}` : ""}) {f.pct > 0 ? "+" : ""}
      {f.pct.toFixed(1)}%
      {a.gap != null && <span style={{ color: gapColor }}> · незаменимость ▲{a.gap.toFixed(1)}</span>}
      {a.count > 0 && <span> · ≥95%: {a.count}</span>}
    </div>
  );
}
