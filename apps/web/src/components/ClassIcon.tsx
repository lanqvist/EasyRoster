import { CLASS_IDS, type ClassId } from "@easyroster/core";
import { className } from "../lib/format";

const FILE: Record<string, string> = {
  WARRIOR: "classicon_warrior", PALADIN: "classicon_paladin", HUNTER: "classicon_hunter", ROGUE: "classicon_rogue", PRIEST: "classicon_priest",
  DEATHKNIGHT: "classicon_deathknight", SHAMAN: "classicon_shaman", MAGE: "classicon_mage", WARLOCK: "classicon_warlock", MONK: "classicon_monk",
  DRUID: "classicon_druid", DEMONHUNTER: "classicon_demonhunter", EVOKER: "classicon_evoker",
};

/** Иконка класса рядом с именем. */
export function ClassIcon({ classId, size = 16, style }: { classId: number; size?: number; style?: React.CSSProperties }) {
  const f = CLASS_IDS[classId as ClassId];
  const file = f ? FILE[f] : null;
  if (!file) return null;
  return (
    <img
      src={`https://wow.zamimg.com/images/wow/icons/${size > 20 ? "medium" : "small"}/${file}.jpg`}
      width={size}
      height={size}
      alt=""
      title={className(classId)}
      style={{ borderRadius: 3, verticalAlign: "-3px", marginRight: 5, flex: "none", ...style }}
      loading="lazy"
    />
  );
}
