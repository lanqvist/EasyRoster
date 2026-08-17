import { SLOT_NAMES_RU, iconUrl, wowheadUrl, type BisCharacterView, type BisEntry, type ObtainedStatus } from "@easyroster/core";
import { QUALITY_COLORS_NUM } from "../lib/format";

export const OBTAINED_STYLE: Record<ObtainedStatus, { color: string; label: string; bg: string }> = {
  yes: { color: "var(--ok)", label: "есть", bg: "rgba(79,191,122,.15)" },
  lower: { color: "var(--warn)", label: "есть, ниже трек", bg: "rgba(224,182,74,.15)" },
  catalyst: { color: "#7cc4ff", label: "катализатор", bg: "rgba(124,196,255,.15)" },
  no: { color: "var(--bad)", label: "нет", bg: "rgba(224,96,96,.12)" },
};

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
    <div>
      {view.slots.map((s) => (
        <div key={s.slot} style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{SLOT_NAMES_RU[s.slot] ?? s.slot}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {s.equipped.map((e) => (
                <span key={e.itemId + (e.ilvl ?? 0)} style={{ marginLeft: 8 }} title={e.itemName ?? ""}>
                  <img src={iconUrl(e.icon, "small")} width={14} height={14} alt="" style={{ verticalAlign: "-2px", marginRight: 3, borderRadius: 2 }} />
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
                    <td className="num muted" style={{ width: 22, padding: "3px 6px" }}>{e.rank}</td>
                    <td style={{ width: 26, padding: "3px 4px" }}>
                      <img src={iconUrl(e.icon, "small")} width={20} height={20} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} loading="lazy" />
                    </td>
                    <td>
                      <a href={wowheadUrl(e.itemId, e.bonusIds, ru ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[e.quality ?? 4] }}>
                        {(ru && e.itemNameRu) || e.itemName}
                      </a>
                      {e.isTier && <span className="muted" style={{ fontSize: 11 }}> · тир</span>}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {e.drops.map((d) => `${d.encounterName}`).slice(0, 2).join(", ")}
                        {e.drops.length === 0 && e.sources[0]?.note ? e.sources[0].note : ""}
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={e.sources.map((x) => `${SOURCE_LABEL[x.source]} ${x.list} #${x.rank}${x.score != null ? ` (${x.score})` : ""}`).join("\n")}>
                      {[...new Set(e.sources.map((x) => SOURCE_LABEL[x.source]))].join(" + ")}
                      <span className="num"> · {e.score}</span>
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
