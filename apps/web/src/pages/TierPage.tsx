import { useEffect, useMemo, useState } from "react";
import { SLOT_NAMES_RU, iconUrl, type TierRow, type TierTokenView } from "@easyroster/core";
import { api } from "../lib/api";
import { classColor, className, relTime, specName } from "../lib/format";
import { OBTAINED_STYLE } from "../components/BisSlotList";
import { CharacterDrawer } from "../components/CharacterDrawer";
import { ClassIcon } from "../components/ClassIcon";

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
  const slotSources = useMemo(() => {
    const m = new Map<string, Map<number, { tokenId: number; name: string; encounterName: string }>>();
    for (const r of data?.rows ?? []) for (const mt of r.missingTokens) {
      let x = m.get(mt.slot);
      if (!x) m.set(mt.slot, (x = new Map()));
      for (const t of mt.tokens) x.set(t.tokenId, t);
    }
    // несколько токенов на босса (по группам брони) — в легенде показываем боссов без повторов
    return TIER_SLOT_ORDER.filter((s) => m.has(s)).map((s) => {
      const byEnc = new Map<string, { tokenId: number; name: string; encounterName: string }>();
      for (const t of m.get(s)!.values()) if (!byEnc.has(t.encounterName)) byEnc.set(t.encounterName, t);
      return { slot: s, tokens: [...byEnc.values()] };
    });
  }, [data]);

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

      <div className="row" style={{ marginBottom: 8, gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Сортировка:</span>
        {(["priority", "val4", "pieces", "name"] as const).map((k) => (
          <button key={k} className={sort === k ? "primary" : undefined} style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => setSort(k)}>
            {k === "priority" ? "приоритет" : k === "val4" ? "ценность 4pc" : k === "pieces" ? "собрано" : "имя"}
          </button>
        ))}
      </div>
      {slotSources.length > 0 && (
        <div className="card" style={{ padding: "8px 12px", marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Откуда падают части тира (одинаково для всех классов)</div>
          <div className="row" style={{ gap: 14, fontSize: 13 }}>
            {slotSources.map((x) => (
              <span key={x.slot}>
                <b>{SLOT_NAMES_RU[x.slot]}</b>:{" "}
                {x.tokens.map((t, i) => (
                  <a key={t.tokenId} href="#" onClick={(e) => { e.preventDefault(); setToken(t.tokenId); }} title={t.name}>
                    {i ? " / " : ""}{t.encounterName}
                  </a>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="cand-list">
        {rows.map((r, i) => {
          const prioW = maxP > 0 && r.priority != null ? Math.max(3, (r.priority / maxP) * 100) : 0;
          return (
            <div key={r.characterId} className="tier-row" style={{ borderLeftColor: r.pieces >= 4 ? "var(--ok)" : r.pieces >= 2 ? "var(--warn)" : "var(--bad)" }} onClick={() => setSel(r.characterId)}>
              <div className="num muted tier-rank">{i + 1}</div>
              <div className="tier-who">
                <div style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <ClassIcon classId={r.classId} size={18} /><span style={{ color: classColor(r.classId), fontWeight: 700 }}>{r.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}> · {specName(r.specId)}</span>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{r.simAt ? `сим ${relTime(r.simAt)}` : r.val4 == null ? "нет сима" : ""}</div>
              </div>
              <div className="tier-bar" title={`собрано ${r.pieces}/5${r.catalyzable.length ? ` · катализируемо: ${r.catalyzable.map((x) => SLOT_NAMES_RU[x]).join(", ")}` : ""}${r.missing.length ? ` · нужны: ${r.missing.map((x) => SLOT_NAMES_RU[x]).join(", ")}` : ""}`}>
                {TIER_SLOT_ORDER.map((sl) => (
                  <span key={sl} className="tier-seg" title={SLOT_NAMES_RU[sl]} style={{ background: r.owned.includes(sl) ? "var(--ok)" : r.catalyzable.includes(sl) ? "#3fb8a8" : "rgba(224,96,96,.35)" }}>
                    {SLOT_SHORT[sl]}
                  </span>
                ))}
                <span className="num" style={{ marginLeft: 8, fontWeight: 700 }}>{r.pieces}/5</span>
                {r.catalyzable.length > 0 && <span style={{ color: "#3fb8a8", marginLeft: 6 }} title="можно катализировать">⚗{r.catalyzable.length}</span>}
              </div>
              <div className="tier-vals num" title="ценность бонусов из сима">
                <span className="muted">2pc</span> <b>{r.val2 != null ? `${r.val2 > 0 ? "+" : ""}${r.val2.toFixed(1)}%` : "—"}</b>
                <span className="muted" style={{ marginLeft: 8 }}>4pc</span> <b style={{ color: r.val4 != null && r.val4 > 0 ? "var(--ok)" : undefined }}>{r.val4 != null ? `${r.val4 > 0 ? "+" : ""}${r.val4.toFixed(1)}%` : "—"}</b>
                <span className="muted" style={{ marginLeft: 8 }}>{r.pieces >= 4 ? "4pc есть" : `до 4pc ${r.toFour} ч.`}</span>
              </div>
              <div className="tier-prio" title="приоритет = ценность 4pc × близость к 4pc (1 часть → 1.0, 2 → 0.6, 3+ → 0.3; есть 4pc → 0)">
                <div className="tier-prio-bar"><div style={{ width: `${prioW}%` }} /></div>
                <div className="num" style={{ fontSize: 18, fontWeight: 700, color: r.priority == null ? "var(--text-muted)" : r.priority > 0 ? "var(--ok)" : "var(--text-muted)" }}>{r.priority != null ? r.priority.toFixed(1) : "—"}</div>
              </div>
            </div>
          );
        })}
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
          {tok.wanters.length === 0 && <div className="muted">Никому из ростера не в BiS.</div>}
          <div className="cand-list">
            {tok.wanters.map((w) => (
              <div key={w.characterId + w.slot} className="cand-card" style={{ borderLeftColor: OBTAINED_STYLE[w.obtained].color }} onClick={() => setSel(w.characterId)}>
                <div className="cand-main">
                  <div className="cand-name">
                    <ClassIcon classId={w.classId} size={18} /><span style={{ color: classColor(w.classId), fontWeight: 700 }}>{w.name}</span>
                    <span className="muted"> · {specName(w.specId)}</span>
                  </div>
                  <div className="cand-meta muted">
                    {SLOT_NAMES_RU[w.slot] ?? w.slot} · тир {w.pieces}/5 · <span style={{ color: OBTAINED_STYLE[w.obtained].color }}>{OBTAINED_STYLE[w.obtained].label}</span>
                    {w.closes === 4 ? <b style={{ color: "var(--ok)" }}> · закроет 4pc</b> : w.closes === 2 ? <span style={{ color: "var(--warn)" }}> · закроет 2pc</span> : ""}
                    {w.val4 != null ? ` · 4pc = ${w.val4 > 0 ? "+" : ""}${w.val4.toFixed(1)}%` : ""}
                  </div>
                </div>
                <div className="cand-pct">
                  <div className="cand-pct-value" style={{ color: w.piecePct != null && w.piecePct > 0.05 ? "var(--ok)" : "var(--text-muted)" }} title="прирост от этой части с учётом сет-бонуса (сим)">
                    {w.piecePct != null ? `${w.piecePct > 0 ? "+" : ""}${w.piecePct.toFixed(1)}%` : "—"}
                  </div>
                  <div className="cand-pct-sub muted">{w.priority != null ? `приоритет ${w.priority.toFixed(1)}` : "нет сима"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {sel !== null && <CharacterDrawer id={sel} onClose={() => setSel(null)} initialTab="bis" />}
    </div>
  );
}
