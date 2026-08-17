import { TRACK_NAMES_RU, SLOT_NAMES_RU, iconUrl, wowheadUrl, type BisCharacterView, type BisEntry, type ObtainedStatus } from "@easyroster/core";
import { QUALITY_COLORS_NUM } from "../lib/format";
import { AltLine, SourceChips } from "./SourceChips";
import { ItemLink } from "./ItemLink";

export const OBTAINED_STYLE: Record<ObtainedStatus, { color: string; label: string; bg: string }> = {
  yes: { color: "var(--ok)", label: "есть", bg: "rgba(79,191,122,.15)" },
  lower: { color: "var(--warn)", label: "есть, ниже трек", bg: "rgba(224,182,74,.15)" },
  catalyst: { color: "#7cc4ff", label: "катализатор", bg: "rgba(124,196,255,.15)" },
  no: { color: "var(--bad)", label: "нет", bg: "rgba(224,96,96,.12)" },
};

/** Бейдж персонального сима: «+4.8% Myth · +1.4% Hero», для танка — с входящим уроном. */
export function SimBadge({ sources }: { sources: BisEntry["sources"] }) {
  const sims = sources.filter((x) => (x.source === "simc" || x.source === "droptimizer") && x.score != null);
  if (sims.length === 0) return null;
  const parts = sims
    .map((x) => {
      const m = x.meta as { track?: string; delta?: number; dtpsPct?: number | null; role?: string } | null | undefined;
      const track = m?.track ? ` ${TRACK_NAMES_RU[m.track] ?? m.track}` : "";
      const dt = m?.role === "tank" && typeof m.dtpsPct === "number" ? ` (урон ${m.dtpsPct > 0 ? "+" : ""}${m.dtpsPct.toFixed(1)}%)` : "";
      return { pct: x.score!, text: `${x.score! > 0 ? "+" : ""}${x.score!.toFixed(1)}%${track}${dt}`, tip: m?.delta != null ? `Δ ${Math.round(m.delta)} dps` : "" };
    })
    .sort((a, b) => b.pct - a.pct);
  const best = parts[0]!;
  return (
    <div style={{ color: best.pct > 0 ? "var(--ok)" : "var(--text-muted)", fontSize: 12, fontWeight: 600 }} title={"сим по трекам:\n" + parts.map((p) => `${p.text} ${p.tip}`).join("\n")}>
      {best.text}
      {parts.length > 1 && <span className="muted" style={{ fontWeight: 400 }}> · {parts.slice(1, 3).map((p) => p.text.split(" (")[0]).join(" · ")}</span>}
    </div>
  );
}

export const SOURCE_LABEL: Record<string, string> = { icyveins: "Icy Veins", wcl: "WCL", droptimizer: "Droptimizer", simc: "SimC", manual: "Ручное" };

export function BisSlotList({
  view,
  locale,
  onPin,
  onExclude,
}: {
  view: BisCharacterView;
  locale: string;
  onPin?: (e: BisEntry) => void;
  onExclude?: (e: BisEntry) => void;
}) {
  const ru = locale.startsWith("ru");
  return (
    <div className="bis-slot-grid">
      {view.slots.map((s) => (
        <div key={s.slot} style={{ marginBottom: 10, breakInside: "avoid" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{SLOT_NAMES_RU[s.slot] ?? s.slot}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {s.equipped.map((e) => (
                <span key={e.itemId + (e.ilvl ?? 0)} style={{ marginLeft: 8 }} title={e.itemName ?? ""}>
                  <img src={iconUrl(e.icon, "small")} width={14} height={14} alt="" style={{ verticalAlign: "-2px", marginRight: 3, borderRadius: 2 }} onError={(ev) => { const im = ev.currentTarget; if (!im.dataset.fb) { im.dataset.fb = "1"; im.src = `/api/items/${e.itemId}/icon`; } }} />
                  {e.ilvl ?? "?"} {e.track ? `· ${e.track}` : ""}
                </span>
              ))}
            </div>
          </div>
          <table style={{ fontSize: 13 }}>
            <tbody>
              {s.entries.map((e) => {
                const st = OBTAINED_STYLE[e.obtained];
                return (
                  <tr key={e.itemId} style={{ background: e.rank === 1 ? st.bg : undefined }}>
                    <td className="num muted" style={{ width: 22, padding: "3px 6px" }} title={`Балл объединения ${e.score} · ${[...new Set(e.sources.map((x) => SOURCE_LABEL[x.source]))].join(" + ")}`}>{e.rank}</td>
                    <td>
                      <ItemLink itemId={e.itemId} name={(ru && e.itemNameRu) || e.itemName} icon={e.icon} quality={e.quality} bonusIds={e.bonusIds} ru={ru} />
                      {e.isTier && <span className="muted" style={{ fontSize: 11 }}> · тир</span>}
                      <div style={{ marginTop: 2 }}>
                        <SourceChips e={e} />
                      </div>
                      <AltLine e={e} />
                    </td>
                    <td className="num" style={{ fontSize: 12, whiteSpace: "nowrap", textAlign: "right" }} title={`Источники: ${[...new Set(e.sources.map((x) => SOURCE_LABEL[x.source]))].join(" + ")} · балл ${e.score}\n${e.sources.map((x) => `${SOURCE_LABEL[x.source]} ${x.list} #${x.rank}${x.score != null ? ` (${x.score})` : ""}`).join("\n")}`}>
                      <SimBadge sources={e.sources} />
                    </td>
                    <td style={{ color: st.color, fontSize: 12, whiteSpace: "nowrap" }} title={e.obtainedDetail ?? ""}>
                      {st.label}
                    </td>
                    {(onPin || onExclude) && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        {onPin && <button style={{ padding: "1px 6px", fontSize: 11 }} title="Закрепить сверху" onClick={() => onPin(e)}>📌</button>}{" "}
                        {onExclude && <button style={{ padding: "1px 6px", fontSize: 11 }} title="Убрать из списка" onClick={() => onExclude(e)}>✕</button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
