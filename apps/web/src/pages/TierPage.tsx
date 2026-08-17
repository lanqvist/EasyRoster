import { useEffect, useMemo, useState } from "react";
import { SLOT_NAMES_RU, iconUrl, type TierRow, type TierTokenView } from "@easyroster/core";
import { api } from "../lib/api";
import { classColor, className, relTime, specName } from "../lib/format";
import { OBTAINED_STYLE } from "../components/BisSlotList";
import { CharacterDrawer } from "../components/CharacterDrawer";

const TIER_SLOT_ORDER = ["HEAD", "SHOULDER", "CHEST", "HANDS", "LEGS"];
const SLOT_SHORT: Record<string, string> = { HEAD: "Гол", SHOULDER: "Плч", CHEST: "Грд", HANDS: "Кст", LEGS: "Ног" };

function heat(v: number | null, max: number): string | undefined {
  if (v == null || max <= 0) return undefined;
  const t = Math.max(0, Math.min(1, v / max));
  return `rgba(79,191,122,${(0.08 + t * 0.45).toFixed(2)})`;
}

export function TierPage() {
  const [data, setData] = useState<{ rows: TierRow[]; tokens: TierTokenView[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [sort, setSort] = useState<"priority" | "val4" | "pieces" | "name">("priority");
  const [token, setToken] = useState<number | null>(null);

  useEffect(() => {
    api.tier().then(setData).catch((e) => setErr((e as Error).message));
  }, []);

  const rows = useMemo(() => {
    const r = [...(data?.rows ?? [])];
    const cmp: Record<typeof sort, (a: TierRow, b: TierRow) => number> = {
      priority: (a, b) => (b.priority ?? -1) - (a.priority ?? -1) || (b.val4 ?? -1) - (a.val4 ?? -1),
      val4: (a, b) => (b.val4 ?? -1) - (a.val4 ?? -1),
      pieces: (a, b) => b.pieces - a.pieces || (b.val4 ?? -1) - (a.val4 ?? -1),
      name: (a, b) => a.name.localeCompare(b.name, "ru"),
    };
    return r.sort(cmp[sort]);
  }, [data, sort]);

  const max4 = Math.max(0.01, ...rows.map((r) => r.val4 ?? 0));
  const maxP = Math.max(0.01, ...rows.map((r) => r.priority ?? 0));
  const tok = data?.tokens.find((t) => t.tokenId === token) ?? null;

  const th = (key: typeof sort, label: string, title?: string) => (
    <th style={{ cursor: "pointer" }} title={title} onClick={() => setSort(key)}>
      {label} {sort === key ? "▼" : ""}
    </th>
  );

  return (
    <div>
      <h1>Тир-сет</h1>
      {err && <div className="alert bad">{err}</div>}
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }} title="Ценность 2pc/4pc — из автосима (принудительное включение/выключение сет-бонуса в текущем гире). Приоритет = 4pc × близость к 4pc (1 часть → 1.0, 2 → 0.6, 3+ → 0.3; есть 4pc → 0). ⚗ — надет катализируемый предмет в тир-слоте. Хилы без сима — только прогресс.">
        ⓘ приоритет = ценность 4pc × близость к 4pc · ⚗ = можно катализировать · наведите для подробностей
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 13 }}>
          <thead>
            <tr>
              {th("name", "Персонаж")}
              {th("pieces", "Тир")}
              <th>Слоты</th>
              {th("val4", "2pc / 4pc", "ценность бонусов, % dps (сим)")}
              <th>До 4pc</th>
              <th>Нужны токены (боссы)</th>
              {th("priority", "Приоритет")}
              <th>Сим</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.characterId} style={{ cursor: "pointer" }} onClick={() => setSel(r.characterId)}>
                <td>
                  <span style={{ color: classColor(r.classId), fontWeight: 600 }}>{r.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}> · {specName(r.specId)}</span>
                </td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  <b>{r.pieces}</b>/5{" "}
                  <span style={{ letterSpacing: 1, color: r.pieces >= 4 ? "var(--ok)" : r.pieces >= 2 ? "var(--warn)" : "var(--text-muted)" }}>
                    {"▮".repeat(r.pieces)}{"▯".repeat(5 - r.pieces)}
                  </span>
                  {r.catalyzable.length > 0 && <span title={`Катализируемо: ${r.catalyzable.map((s) => SLOT_NAMES_RU[s]).join(", ")}`} style={{ color: "#3fb8a8" }}> ⚗{r.catalyzable.length}</span>}
                </td>
                <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {TIER_SLOT_ORDER.map((s) => (
                    <span
                      key={s}
                      title={SLOT_NAMES_RU[s]}
                      style={{
                        display: "inline-block", padding: "0 4px", marginRight: 2, borderRadius: 3,
                        background: r.owned.includes(s) ? "rgba(79,191,122,.25)" : r.catalyzable.includes(s) ? "rgba(63,184,168,.2)" : "rgba(224,96,96,.12)",
                        color: r.owned.includes(s) ? "var(--ok)" : r.catalyzable.includes(s) ? "#3fb8a8" : "var(--bad)",
                      }}
                    >
                      {SLOT_SHORT[s]}
                    </span>
                  ))}
                </td>
                <td className="num" style={{ background: heat(r.val4, max4), whiteSpace: "nowrap" }}>
                  {r.val2 != null ? `${r.val2 > 0 ? "+" : ""}${r.val2.toFixed(1)}%` : "—"} / <b>{r.val4 != null ? `${r.val4 > 0 ? "+" : ""}${r.val4.toFixed(1)}%` : "—"}</b>
                </td>
                <td className="num">{r.pieces >= 4 ? <span style={{ color: "var(--ok)" }}>есть</span> : `${r.toFour} ч.`}</td>
                <td style={{ fontSize: 11 }}>
                  {r.pieces >= 4
                    ? <span className="muted">5/5 — {r.missing.map((s) => SLOT_NAMES_RU[s]).join(", ") || "полный"}</span>
                    : r.missingTokens.map((m) => (
                        <span key={m.slot} style={{ display: "inline-block", marginRight: 8 }}>
                          <span className="muted">{SLOT_SHORT[m.slot]}:</span>{" "}
                          {m.tokens.length ? m.tokens.map((t) => (
                            <a key={t.tokenId} href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setToken(t.tokenId); }} title={t.name}>
                              {t.encounterName}
                            </a>
                          )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, "/", el] : [el]), []) : <span className="muted">?</span>}
                        </span>
                      ))}
                </td>
                <td className="num" style={{ background: heat(r.priority, maxP), fontWeight: 600 }}>{r.priority != null ? r.priority.toFixed(1) : "—"}</td>
                <td className="muted" style={{ fontSize: 11 }}>{r.simAt ? relTime(r.simAt) : r.val4 == null ? "нет" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 20 }}>Токены — кому</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        {data?.tokens.map((t) => (
          <button key={t.tokenId} className={token === t.tokenId ? "primary" : undefined} onClick={() => setToken(t.tokenId)} title={t.instanceName}>
            <img src={iconUrl(t.icon, "small")} width={16} height={16} alt="" style={{ verticalAlign: "middle", marginRight: 4, borderRadius: 2 }} onError={(ev) => { const im = ev.currentTarget; if (!im.dataset.fb) { im.dataset.fb = "1"; im.src = `/api/items/${t.tokenId}/icon`; } }} />
            {t.name} <span className="muted" style={{ fontSize: 11 }}>· {t.encounterName}</span>
          </button>
        ))}
      </div>
      {tok && (
        <div className="card" style={{ padding: "8px 12px" }}>
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Кому</th>
                <th>Слот</th>
                <th>Тир</th>
                <th>Статус</th>
                <th className="num" title="Прирост от этой части с учётом сет-бонуса (сим)">Даёт</th>
                <th>Закроет</th>
                <th className="num">4pc</th>
                <th className="num">Приоритет</th>
              </tr>
            </thead>
            <tbody>
              {tok.wanters.map((w) => (
                <tr key={w.characterId + w.slot} style={{ cursor: "pointer" }} onClick={() => setSel(w.characterId)}>
                  <td><span style={{ color: classColor(w.classId), fontWeight: 600 }}>{w.name}</span> <span className="muted">· {className(w.classId)}</span></td>
                  <td className="muted">{SLOT_NAMES_RU[w.slot] ?? w.slot}</td>
                  <td className="num">{w.pieces}/5</td>
                  <td style={{ color: OBTAINED_STYLE[w.obtained].color }}>{OBTAINED_STYLE[w.obtained].label}</td>
                  <td className="num" style={{ color: w.piecePct != null && w.piecePct > 0 ? "var(--ok)" : undefined, fontWeight: 600 }}>{w.piecePct != null ? `${w.piecePct > 0 ? "+" : ""}${w.piecePct.toFixed(1)}%` : "—"}</td>
                  <td>{w.closes === 4 ? <b style={{ color: "var(--ok)" }}>4pc</b> : w.closes === 2 ? <span style={{ color: "var(--warn)" }}>2pc</span> : w.closes === 5 ? "5/5" : ""}</td>
                  <td className="num">{w.val4 != null ? `${w.val4 > 0 ? "+" : ""}${w.val4.toFixed(1)}%` : "—"}</td>
                  <td className="num">{w.priority != null ? w.priority.toFixed(1) : "—"}</td>
                </tr>
              ))}
              {tok.wanters.length === 0 && <tr><td colSpan={8} className="muted">Никому из ростера не в BiS.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {sel !== null && <CharacterDrawer id={sel} onClose={() => setSel(null)} initialTab="bis" />}
    </div>
  );
}
