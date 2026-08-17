import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RAID_DIFFICULTY_LABEL, SLOT_NAMES_RU, SLOT_TO_EQUIP_SLOTS, TRACK_NAMES_RU, type BisCharacterView, type BisEntry, type CharacterDetail } from "@easyroster/core";
import { api } from "../lib/api";
import { useDifficulty } from "../lib/difficulty";
import { classColor, specName } from "../lib/format";
import { ItemLink } from "./ItemLink";
import { ClassIcon } from "./ClassIcon";
import { KIND_LABEL } from "./SourceChips";
import { OBTAINED_STYLE } from "./BisSlotList";

const QUALITY_NUM_BY_TYPE: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };

const pctText = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const pctColor = (v: number | null | undefined) => (v == null ? "var(--text-muted)" : v > 0.05 ? "var(--ok)" : v < -0.05 ? "var(--bad)" : "var(--text-muted)");

function shortSource(e: BisEntry): string {
  const good = e.drops.filter((d) => d.kind === "raid" || d.kind === "mplus" || d.kind === "world");
  const use = good.length ? good : e.drops.filter((d) => !/catalyst/i.test(d.instanceName));
  const enc = use[0]?.encounterName ?? "";
  const kind = KIND_LABEL[e.sourceKind];
  if (e.sourceKind === "catalyst") return `Катализатор${enc ? ` ← ${enc}` : ""}`;
  return enc ? `${kind} · ${enc}` : kind;
}

/** Крафт/прочее из name_description Blizzard → коротко. */
function shortTrackName(t: string | null | undefined): string {
  if (!t) return "";
  if (/изготовлен|crafted/i.test(t)) return "Крафт";
  return t.length > 14 ? t.slice(0, 13) + "…" : t;
}

/** Строка кандидата: [иконка] имя | источник | трек | % */
function Row({ e, ru, highlight, index }: { e: BisEntry; ru: boolean; highlight?: boolean; index?: number }) {
  const dt = e.dropTrack;
  const st = OBTAINED_STYLE[e.obtained];
  return (
    <div className={`sf-row sf-card${highlight ? " active" : ""}`} style={{ borderLeftColor: highlight ? "var(--accent)" : st.color }}>
      <div className="muted num" style={{ fontSize: 12 }}>{index != null ? index : ""}</div>
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <ItemLink itemId={e.itemId} name={(ru && e.itemNameRu) || e.itemName} icon={e.icon} quality={e.quality} bonusIds={e.bonusIds} ru={ru} size={24} style={{ fontSize: 14, maxWidth: "100%" }} />
        {e.isTier && <span className="muted" style={{ fontSize: 10 }}> тир</span>}
      </div>
      <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={shortSource(e)}>{shortSource(e)}</div>
      <div className="muted num" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{dt ? `${TRACK_NAMES_RU[dt.name] ?? dt.name} ${dt.ilvl ?? ""}` : ""}</div>
      <div className="num" style={{ fontSize: 14, fontWeight: 600, textAlign: "right", color: pctColor(e.simSelected?.pct) }} title={e.simByTrack ? Object.entries(e.simByTrack).map(([t, v]) => `${TRACK_NAMES_RU[t] ?? t}: ${pctText(v)}`).join("\n") : ""}>
        {e.simSelected ? pctText(e.simSelected.pct) : <span className="muted" style={{ fontWeight: 400 }}>{e.score}</span>}
      </div>
      <div style={{ fontSize: 10, color: st.color, whiteSpace: "nowrap" }} title={e.obtainedDetail ?? ""}>{e.obtained === "no" ? "" : st.label}</div>
    </div>
  );
}

/** Мини-карточка «персонаж × слот» для Распределения лута: надето → выпало (вердикт) → что лучше. */
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
  const entries = view?.entries ?? [];
  const dropped = highlightItemId ? entries.find((e) => e.itemId === highlightItemId || e.originalItemId === highlightItemId) : undefined;
  const others = entries.filter((e) => e !== dropped);
  const better = dropped?.simSelected ? others.filter((o) => (o.simSelected?.pct ?? -Infinity) > dropped.simSelected!.pct) : others.filter((o) => dropped && o.rank < dropped.rank);
  const diffLabel = RAID_DIFFICULTY_LABEL[difficulty];

  // вердикт по выпавшему предмету
  let verdict: { text: string; color: string } | null = null;
  if (dropped) {
    const p = dropped.simSelected?.pct;
    const st = OBTAINED_STYLE[dropped.obtained];
    if (dropped.obtained === "yes") verdict = { text: `уже есть (${dropped.obtainedDetail ?? "на макс. треке"})`, color: st.color };
    else if (dropped.obtained === "lower") verdict = { text: `есть, ниже трек — ${dropped.obtainedDetail ?? ""}`, color: st.color };
    else if (p != null) {
      if (p > 0.05) verdict = { text: `апгрейд ${pctText(p)} на ${diffLabel}${better.length ? ` · есть ${better.length} лучше` : " · лучший вариант слота"}`, color: "var(--ok)" };
      else if (p < -0.05) verdict = { text: `хуже надетого на ${Math.abs(p).toFixed(1)}% на ${diffLabel}${dropped.simByTrack && Object.values(dropped.simByTrack).some((v) => v > 0.05) ? " (на более высоком треке — апгрейд, см. %)" : ""}`, color: "var(--bad)" };
      else verdict = { text: `≈ как надетое (${pctText(p)})`, color: "var(--text-muted)" };
    } else verdict = { text: `#${dropped.rank} в BiS-листе слота (сима нет)`, color: "var(--text-muted)" };
  }
  const alt = dropped?.alternatives?.farmable ?? null;

  return (
    <div className="slot-focus" style={{ fontSize: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <ClassIcon classId={c.classId} size={20} /><span style={{ color: classColor(c.classId), fontWeight: 600, fontSize: 16 }}>{c.name}</span>
          <span className="muted"> · {specName(c.activeSpecId)} · ilvl {c.ilvlEquipped?.toFixed(0) ?? "—"}{bis ? ` · BiS ${bis.coverage.pct}%` : ""}</span>
        </div>
        <Link to={`/character/${c.id}`} className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>карточка ↗</Link>
      </div>

      <div className="sf-title">Надето · {SLOT_NAMES_RU[slot] ?? slot}</div>
      {equipped.length === 0 && <div className="muted">— пусто</div>}
      {equipped.map((it) => (
        <div key={it.slot} className="sf-row">
          <div />
          <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <ItemLink itemId={it.itemId} name={it.itemName ?? `#${it.itemId}`} icon={it.icon} quality={QUALITY_NUM_BY_TYPE[it.quality ?? ""] ?? 4} bonusIds={it.bonusIds} ru={ru} size={24} style={{ fontSize: 14 }} />
          </div>
          <div />
          <div className="muted num" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.trackName ?? ""}>{it.track ? `${TRACK_NAMES_RU[it.track.name] ?? it.track.name} ${it.track.level}/${it.track.max}` : shortTrackName(it.trackName)}</div>
          <div className="num" style={{ textAlign: "right" }}>{it.ilvl ?? "?"}</div>
          <div />
        </div>
      ))}

      {dropped && (
        <>
          <div className="sf-title" style={{ marginTop: 10 }}>Выпало</div>
          <Row e={dropped} ru={ru} highlight />
          {verdict && <div style={{ color: verdict.color, margin: "2px 0 0 22px", fontWeight: 600 }}>{verdict.text}</div>}
          {alt && (
            <>
              <div className="sf-title" style={{ marginTop: 8 }}>
                Без рейда можно взять
                {dropped.alternatives?.gap != null && dropped.alternatives.gap > 0.05 && <span style={{ textTransform: "none", letterSpacing: 0 }}> · выпавшее лучше на ▲{dropped.alternatives.gap.toFixed(1)}</span>}
              </div>
              <div className="sf-row">
                <div />
                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <ItemLink itemId={alt.itemId} name={alt.name} icon={alt.icon ?? null} quality={alt.quality} bonusIds={alt.bonusIds ?? []} ru={ru} size={24} style={{ fontSize: 14 }} />
                </div>
                <div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`${KIND_LABEL[alt.kind]}${alt.sourceName ? ` · ${alt.sourceName}` : ""}`}>{KIND_LABEL[alt.kind]}{alt.sourceName ? ` · ${alt.sourceName}` : ""}</div>
                <div />
                <div className="num" style={{ fontSize: 12, fontWeight: 600, textAlign: "right", color: pctColor(alt.pct) }}>{pctText(alt.pct)}</div>
                <div />
              </div>
            </>
          )}
        </>
      )}

      {(dropped ? better : entries).length > 0 && (
        <>
          <div className="sf-title" style={{ marginTop: 10 }}>{dropped ? "Лучше для этого слота" : "Кандидаты слота"}</div>
          {(dropped ? better : entries).slice(0, 5).map((e, i) => (
            <Row key={e.itemId} e={e} ru={ru} index={i + 1} />
          ))}
        </>
      )}
      {dropped && better.length === 0 && dropped.obtained === "no" && (dropped.simSelected?.pct ?? 0) > 0.05 && (
        <div className="muted" style={{ marginTop: 6 }}>Лучше для этого слота ничего нет — брать.</div>
      )}
      {!bis && <div className="muted" style={{ marginTop: 6 }}>считаю…</div>}
    </div>
  );
}
