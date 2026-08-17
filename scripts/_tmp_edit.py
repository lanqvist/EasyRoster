def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

# ---- DifficultySwitch: явный select с подписью
edit('apps/web/src/lib/difficulty.tsx',[
 ('''export function DifficultySwitch({ compact = false }: { compact?: boolean }) {
  const { difficulty, setDifficulty } = useDifficulty();
  return (
    <span className="row" style={{ gap: 4 }} title="Сложность рейда: определяет трек/ilvl и % сима для рейдовых предметов">
      {!compact && <span className="muted" style={{ fontSize: 12 }}>Рейд:</span>}
      {(["normal", "heroic", "mythic"] as RaidDifficulty[]).map((d) => (
        <button
          key={d}
          className={difficulty === d ? "primary" : undefined}
          style={{ padding: "2px 8px", fontSize: 12 }}
          onClick={() => setDifficulty(d)}
          title={`${RAID_DIFFICULTY_LABEL[d]} → трек ${TRACK_NAMES_RU[RAID_DIFFICULTY_TRACK[d]] ?? RAID_DIFFICULTY_TRACK[d]}`}
        >
          {RAID_DIFFICULTY_LABEL[d]}
        </button>
      ))}
    </span>
  );
}''','''export function DifficultySwitch({ compact = false }: { compact?: boolean }) {
  const { difficulty, setDifficulty } = useDifficulty();
  return (
    <label className="row" style={{ gap: 8, alignItems: "center" }} title="На какой сложности вы сейчас рейдите: определяет трек/ilvl выпадающих предметов и какой % сима показывать как основной. Разбивка по всем сложностям видна в карточках.">
      <span style={{ fontSize: compact ? 12 : 13 }}>{compact ? "Сложность:" : "Сложность рейда сейчас:"}</span>
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as RaidDifficulty)} style={{ fontWeight: 600 }}>
        {(["normal", "heroic", "mythic"] as RaidDifficulty[]).map((d) => (
          <option key={d} value={d}>
            {RAID_DIFFICULTY_LABEL[d]} → {TRACK_NAMES_RU[RAID_DIFFICULTY_TRACK[d]] ?? RAID_DIFFICULTY_TRACK[d]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Разбивка % сима по трекам: «Н +1.2 · Г +2.9 · М +4.8», активный трек жирным. */
export function TrackBreakdown({ byTrack, active, size = 11 }: { byTrack: Record<string, number> | null | undefined; active?: string | null; size?: number }) {
  if (!byTrack) return null;
  const order = ["Champion", "Hero", "Myth"];
  const short: Record<string, string> = { Champion: "Н", Hero: "Г", Myth: "М" };
  const parts = order.filter((t) => byTrack[t] != null);
  if (parts.length < 2) return null;
  return (
    <span className="num" style={{ fontSize: size, whiteSpace: "nowrap" }} title="Normal → Чемпион, Heroic → Герой, Mythic → Миф">
      {parts.map((t, i) => {
        const v = byTrack[t]!;
        const isActive = t === active;
        return (
          <span key={t} style={{ fontWeight: isActive ? 700 : 400, color: isActive ? (v > 0.05 ? "var(--ok)" : v < -0.05 ? "var(--bad)" : "var(--text)") : "var(--text-muted)" }}>
            {i ? " · " : ""}{short[t]} {v > 0 ? "+" : ""}{v.toFixed(1)}
          </span>
        );
      })}
    </span>
  );
}'''),
])

# ---- убрать тумблер со страницы персонажа и лут-таблиц; добавить кнопку «Симить» в шапку
edit('apps/web/src/components/CharacterView.tsx',[
 ('          <DifficultySwitch compact />\n','''          <SimNowButton characterId={id} onDone={loadBis} />
'''),
 ('import { DifficultySwitch, useDifficulty } from "../lib/difficulty";','import { useDifficulty } from "../lib/difficulty";\nimport { SimNowButton } from "./SimNowButton";'),
])
edit('apps/web/src/pages/LootPage.tsx',[
 ('        <DifficultySwitch />\n',''),
 ('import { DifficultySwitch, useDifficulty } from "../lib/difficulty";','import { useDifficulty } from "../lib/difficulty";'),
])

# ---- разбивка по трекам в карточках
edit('apps/web/src/components/SlotCompare.tsx',[
 ('        <div className="cand-pct-sub" style={{ color: st.color }} title={e.obtainedDetail ?? ""}>{st.label}</div>',
  '''        <div className="cand-pct-sub" style={{ color: st.color }} title={e.obtainedDetail ?? ""}>{st.label}</div>
        {(e.sourceKind === "raid" || e.sourceKind === "catalyst" || e.sourceKind === "world") && <div><TrackBreakdown byTrack={e.simByTrack} active={e.simSelected?.track} /></div>}'''),
 ('import { OBTAINED_STYLE } from "./BisSlotList";','import { OBTAINED_STYLE } from "./BisSlotList";\nimport { TrackBreakdown } from "../lib/difficulty";'),
])
edit('apps/web/src/pages/RaidNightPage.tsx',[
 ('        <div className="cand-pct-sub muted">\n          {pct != null && w.simTrack ? (TRACK_NAMES_RU[w.simTrack] ?? w.simTrack) : pct == null ? "нет сима" : ""}\n        </div>',
  '''        <div className="cand-pct-sub muted">
          {pct != null && w.simTrack ? (TRACK_NAMES_RU[w.simTrack] ?? w.simTrack) : pct == null ? "нет сима" : ""}
        </div>
        {w.simByTrack && <TrackBreakdown byTrack={w.simByTrack} active={w.simTrack} />}'''),
 ('import { DifficultySwitch, useDifficulty } from "../lib/difficulty";','import { DifficultySwitch, TrackBreakdown, useDifficulty } from "../lib/difficulty";'),
])
# ItemWanter: simByTrack
edit('packages/core/src/bis.ts',[
 ('  simTrack?: string | null;\n  alt?: BisAlternatives | null;','  simTrack?: string | null;\n  simByTrack?: Record<string, number> | null;\n  alt?: BisAlternatives | null;'),
])
s=open('apps/server/src/services/bis/service.ts',encoding='utf8').read()
s=s.replace('simTrack: e.simSelected?.track ?? null,\n            alt: e.alternatives,','simTrack: e.simSelected?.track ?? null,\n            simByTrack: e.simByTrack,\n            alt: e.alternatives,')
s=s.replace('simTrack: e.simSelected?.track ?? null, alt: e.alternatives, sourceKind: e.sourceKind,','simTrack: e.simSelected?.track ?? null, simByTrack: e.simByTrack, alt: e.alternatives, sourceKind: e.sourceKind,')
open('apps/server/src/services/bis/service.ts','w',encoding='utf8').write(s)

# ---- SimNowButton компонент
open('apps/web/src/components/SimNowButton.tsx','w',encoding='utf8').write('''import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Кнопка таргетного пересима персонажа с состоянием (в очереди / идёт / готово). */
export function SimNowButton({ characterId, onDone, small = false, label = "⟳ Симить" }: { characterId: number; onDone?: () => void; small?: boolean; label?: string }) {
  const [state, setState] = useState<"idle" | "queued" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "queued" && state !== "running") return;
    const id = setInterval(async () => {
      try {
        const s = await api.simStatus();
        const me = s.characters.find((c) => c.characterId === characterId);
        if (s.current?.characterId === characterId) setState("running");
        else if (me && !me.queued) {
          setState(me.lastOk ? "done" : "error");
          setMsg(me.lastOk ? null : me.lastMessage);
          onDone?.();
          clearInterval(id);
        }
      } catch { /* ignore */ }
    }, 2500);
    return () => clearInterval(id);
  }, [state, characterId, onDone]);

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMsg(null);
    try {
      const st = await api.simStatus();
      if (!st.simcPath) throw new Error("SimC не установлен (страница BiS → Установить)");
      const r = await api.simRun({ ids: [characterId] });
      if (r.queued === 0) throw new Error("не поставлен (хил / нет спеки / уже в очереди)");
      setState("queued");
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  };
  const text = state === "queued" ? "в очереди…" : state === "running" ? "симлю…" : state === "done" ? "✓ готово" : state === "error" ? "ошибка" : label;
  return (
    <button
      onClick={run}
      disabled={state === "queued" || state === "running"}
      title={msg ?? "Пересимить этого персонажа (предметы и тир-сет)"}
      style={{ padding: small ? "1px 8px" : "3px 10px", fontSize: small ? 11 : 12, color: state === "error" ? "var(--bad)" : state === "done" ? "var(--ok)" : undefined }}
    >
      {text}
    </button>
  );
}
''')

# ---- Tier rows: кнопка
edit('apps/web/src/pages/TierPage.tsx',[
 ('                <div className="muted" style={{ fontSize: 11 }}>{r.simAt ? `сим ${relTime(r.simAt)}` : r.val4 == null ? "нет сима" : ""}</div>',
  '''                <div className="muted row" style={{ fontSize: 11, gap: 6 }}>
                  <span>{r.simAt ? `сим ${relTime(r.simAt)}` : r.val4 == null ? "нет сима" : ""}</span>
                  <SimNowButton characterId={r.characterId} small onDone={reload} />
                </div>'''),
 ('import { SimPanel } from "../components/SimPanel";','import { SimPanel } from "../components/SimPanel";\nimport { SimNowButton } from "../components/SimNowButton";'),
 ('''  useEffect(() => {
    api.tier().then(setData).catch((e) => setErr((e as Error).message));
  }, []);''','''  const reload = useCallback(() => api.tier().then(setData).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    void reload();
  }, [reload]);'''),
 ('import { useEffect, useMemo, useState } from "react";','import { useCallback, useEffect, useMemo, useState } from "react";'),
])
print("ok")
