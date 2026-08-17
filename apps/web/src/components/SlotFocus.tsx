import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SLOT_NAMES_RU, SLOT_TO_EQUIP_SLOTS, TRACK_NAMES_RU, type BisCharacterView, type CharacterDetail } from "@easyroster/core";
import { api } from "../lib/api";
import { useDifficulty } from "../lib/difficulty";
import { classColor, specName } from "../lib/format";
import { ItemLink } from "./ItemLink";
import { ItemRow } from "./ItemRow";

const QUALITY_NUM_BY_TYPE: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };

/** Мини-карточка «персонаж × слот» для Лут-ночи: что надето, кандидаты слота, альтернативы. */
export function SlotFocus({ characterId, slot, highlightItemId, ru }: { characterId: number; slot: string; highlightItemId?: number; ru: boolean }) {
  const { difficulty } = useDifficulty();
  const [detail, setDetail] = useState<CharacterDetail | null>(null);
  const [bis, setBis] = useState<BisCharacterView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setBis(null);
    api.character(characterId).then(setDetail).catch((e) => setErr((e as Error).message));
    api.bisCharacter(characterId, undefined, difficulty).then(setBis).catch((e) => setErr((e as Error).message));
  }, [characterId, difficulty]);

  if (err) return <div className="alert bad">{err}</div>;
  if (!detail) return <div className="muted">Загрузка…</div>;
  const c = detail.character;
  const equipSlots = SLOT_TO_EQUIP_SLOTS[slot] ?? [slot];
  const equipped = detail.equipment.filter((e) => equipSlots.includes(e.slot));
  const view = bis?.slots.find((s) => s.slot === slot);
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <span style={{ color: classColor(c.classId), fontWeight: 600 }}>{c.name}</span>
          <span className="muted"> · {specName(c.activeSpecId)} · ilvl {c.ilvlEquipped?.toFixed(0) ?? "—"}</span>
          {bis && <span className="muted"> · BiS {bis.coverage.pct}%</span>}
        </div>
        <Link to={`/character/${c.id}`} className="muted" style={{ fontSize: 12 }}>карточка ↗</Link>
      </div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>Надето · {SLOT_NAMES_RU[slot] ?? slot}</div>
      {equipped.length === 0 && <div className="muted" style={{ fontSize: 12 }}>—</div>}
      {equipped.map((it) => (
        <div key={it.slot} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
          <ItemLink itemId={it.itemId} name={it.itemName ?? `#${it.itemId}`} icon={it.icon} quality={QUALITY_NUM_BY_TYPE[it.quality ?? ""] ?? 4} bonusIds={it.bonusIds} ru={ru} size={18} style={{ fontSize: 12 }} />
          <span className="num muted" style={{ fontSize: 11 }}>{it.ilvl ?? "?"}{it.track ? ` · ${TRACK_NAMES_RU[it.track.name] ?? it.track.name} ${it.track.level}/${it.track.max}` : ""}</span>
        </div>
      ))}
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 8 }}>Кандидаты слота</div>
      {!view && <div className="muted" style={{ fontSize: 12 }}>{bis ? "нет кандидатов" : "считаю…"}</div>}
      {view?.entries.map((e) => (
        <div key={e.itemId} style={{ background: e.itemId === highlightItemId ? "rgba(217,164,65,.12)" : undefined, borderRadius: 4, padding: "0 4px" }}>
          <ItemRow e={e} ru={ru} showAlt={e.itemId === highlightItemId || e.rank <= 2} dense />
        </div>
      ))}
    </div>
  );
}
