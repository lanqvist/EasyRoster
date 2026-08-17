import { iconUrl, wowheadUrl } from "@easyroster/core";
import { QUALITY_COLORS_NUM } from "../lib/format";

/** Иконка предмета с фолбэком на Blizzard media. */
export function ItemIcon({ itemId, icon, size = 32, style }: { itemId: number; icon?: string | null; size?: number; style?: React.CSSProperties }) {
  return (
    <img
      src={iconUrl(icon, size >= 40 ? "large" : size >= 22 ? "medium" : "small")}
      width={size}
      height={size}
      alt=""
      style={{ borderRadius: 4, flex: "none", display: "block", ...style }}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallback) return;
        img.dataset.fallback = "1";
        img.src = `/api/items/${itemId}/icon`;
      }}
    />
  );
}

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
      onClick={(e) => {
        // переход на Wowhead — только с Ctrl/Cmd/средней кнопкой; обычный клик не уводит со страницы (миссклики)
        if (!(e.ctrlKey || e.metaKey || e.button === 1)) e.preventDefault();
      }}
      title="Ctrl+клик — открыть на Wowhead"
      style={{ color: muted ? "var(--text-muted)" : QUALITY_COLORS_NUM[quality ?? 4], display: "inline-flex", alignItems: "center", gap: 6, ...style }}
    >
      {icon !== undefined && (
        <img
          src={iconUrl(icon, size >= 40 ? "large" : size >= 22 ? "medium" : "small")}
          width={size}
          height={size}
          alt=""
          style={{ borderRadius: 3, flex: "none" }}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallback) return;
            img.dataset.fallback = "1";
            img.src = `/api/items/${itemId}/icon`;
          }}
        />
      )}
      <span>{name}</span>
      {children}
    </a>
  );
}
