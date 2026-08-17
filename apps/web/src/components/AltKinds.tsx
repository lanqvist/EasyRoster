import { TRACK_NAMES_RU, type AltByKind } from "@easyroster/core";
import { ItemLink } from "./ItemLink";

const ALT_KIND_LABEL: Array<[keyof AltByKind, string]> = [["mplus", "M+"], ["raid", "др. босс"], ["vault", "тайник"], ["craft", "крафт"]];

/** Цвет вердикта: насколько выпавшее лучше альтернативы (own − alt). */
function diffColor(diff: number | null): string {
  if (diff == null) return "var(--text-muted)";
  if (diff >= 1) return "var(--ok)";
  if (diff >= 0.3) return "var(--warn)";
  return "var(--text-muted)";
}

/** Строка «альтернативы по типам контента»: M+ · другой босс · тайник · крафт — с % и разницей к выпавшему. */
export function AltKinds({ byKind, own, ru = true }: { byKind: AltByKind; own: number | null; ru?: boolean }) {
  const parts = ALT_KIND_LABEL.map(([k, label]) => ({ k, label, a: byKind[k] })).filter((x) => x.a);
  if (!parts.length) return <div className="cand-alt muted">альтернатив в слоте нет — незаменим</div>;
  return (
    <div className="cand-alt muted" style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
      {parts.map(({ k, label, a }) => {
        const diff = own != null ? own - a!.pct : null;
        const title = `${label}: ${a!.name}${a!.sourceName ? ` — ${a!.sourceName}` : ""}${own != null ? `\nальтернатива ${a!.pct > 0 ? "+" : ""}${a!.pct.toFixed(1)}%, выпавшее ${own > 0 ? "+" : ""}${own.toFixed(1)}%` : ""}${a!.pctByTrack ? "\nпо трекам: " + Object.entries(a!.pctByTrack).map(([t, v]) => `${TRACK_NAMES_RU[t] ?? t} ${v > 0 ? "+" : ""}${v.toFixed(1)}`).join(" · ") : ""}`;
        return (
          <span key={k} title={title} style={{ whiteSpace: "nowrap" }}>
            <span style={{ opacity: 0.8 }}>{label}:</span>{" "}
            <ItemLink itemId={a!.itemId} name={a!.name} icon={a!.icon ?? null} quality={a!.quality} bonusIds={a!.bonusIds ?? []} ru={ru} size={13} muted style={{ fontSize: 11 }} />
            {own != null ? (
              <>
                {" "}<span className="num">{a!.pct > 0 ? "+" : ""}{a!.pct.toFixed(1)}%</span>
                {diff != null && <span className="num" style={{ color: diffColor(diff), marginLeft: 3 }}>{diff >= 0.05 ? `▲${diff.toFixed(1)}` : diff <= -0.05 ? `▼${(-diff).toFixed(1)}` : "≈"}</span>}
              </>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

