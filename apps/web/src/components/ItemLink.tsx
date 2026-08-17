import { iconUrl, wowheadUrl } from "@easyroster/core";
import { QUALITY_COLORS_NUM } from "../lib/format";

/**
 * Ссылка на предмет с иконкой и тултипом Wowhead. Иконка и имя — внутри одного <a>,
 * чтобы наведение на любую часть показывало тултип; data-wowhead задаёт предмет/bonus явно.
 */
export function ItemLink({
  itemId,
  name,
  icon,
  quality,
  bonusIds = [],
  size = 20,
  ru = true,
  muted,
  style,
  children,
}: {
  itemId: number;
  name: string;
  icon?: string | null;
  quality?: number | null;
  bonusIds?: number[];
  size?: number;
  ru?: boolean;
  muted?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const wh = `item=${itemId}${bonusIds.length ? `&bonus=${bonusIds.join(":")}` : ""}${ru ? "&domain=ru" : ""}`;
  return (
    <a
      href={wowheadUrl(itemId, bonusIds, ru ? "ru" : "en")}
      target="_blank"
      rel="noreferrer"
      data-wowhead={wh}
      className="item-link"
      style={{ color: muted ? "var(--text-muted)" : QUALITY_COLORS_NUM[quality ?? 4], display: "inline-flex", alignItems: "center", gap: 6, ...style }}
    >
      {icon !== undefined && <img src={iconUrl(icon, "small")} width={size} height={size} alt="" style={{ borderRadius: 3, flex: "none" }} loading="lazy" />}
      <span>{name}</span>
      {children}
    </a>
  );
}
