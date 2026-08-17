import re
def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

# ---------- 1. Wowhead tooltips: index.html + refresh hook
edit('apps/web/index.html',[
 ('    <title>EasyRoster</title>','''    <title>EasyRoster</title>
    <script>
      // Тултипы Wowhead при наведении на ссылки wowhead.com/item=…
      window.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false, iconSize: "small", hide: { droppedby: true, sellprice: true } };
    </script>
    <script src="https://wow.zamimg.com/js/tooltips.js" async></script>'''),
])
edit('apps/web/src/App.tsx',[
 ('function Shell() {','''/** Пере-инициализация тултипов Wowhead после любых изменений DOM (React рендерит ссылки динамически). */
function useWowheadTooltips() {
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      timer = null;
      const wp = (window as unknown as { $WowheadPower?: { refreshLinks?: () => void } }).$WowheadPower;
      wp?.refreshLinks?.();
    };
    const obs = new MutationObserver(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
}

function Shell() {
  useWowheadTooltips();'''),
 ('import { useState } from "react";','import { useEffect, useState } from "react";'),
])

# ---------- 2. WowIntegrationCard compact = одна строка статуса + кнопки
edit('apps/web/src/components/WowIntegrationCard.tsx',[
 ('  return (\n    <div className="card">\n      {!compact && <h2>Интеграция с WoW</h2>}',
  '''  if (compact) {
    const dot = (ok: boolean | null, label: string, title?: string) => (
      <span title={title} style={{ marginRight: 12, whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 5, background: ok == null ? "var(--text-muted)" : ok ? "var(--ok)" : "var(--bad)" }} />
        {label}
      </span>
    );
    return (
      <div className="card" style={{ padding: "8px 12px", marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
          <div className="row" style={{ gap: 0 }}>
            {dot(st.wowPathValid, "WoW", "Папка _retail_")}
            {dot(st.rclcInstalled, "RCLootCouncil")}
            {dot(st.addonInstalled ? st.addonVersion === st.addonSourceVersion : false, st.addonInstalled ? `аддон v${st.addonVersion}` : "аддон не установлен", st.addonInstalled && st.addonVersion !== st.addonSourceVersion ? `доступна ${st.addonSourceVersion}` : "")}
            {dot(!!st.dataTimestamp, st.dataTimestamp ? `db.lua ${dataAge}` : "db.lua нет", st.dataTimestamp ? `персонажей ${st.dataCharacters}` : "")}
            {dot(st.lootHistoryCount > 0, `история ${st.lootHistoryCount}`, st.lastHistoryImportAt ? `импорт ${relTime(st.lastHistoryImportAt)}` : "")}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="primary" style={{ padding: "3px 10px", fontSize: 12 }} disabled={!!busy || !st.wowPathValid} onClick={() => run("export", async () => { const r = await api.wowExport(); return `db.lua записан: ${r.characters} перс. — в игре /reload`; })}>
              {busy === "export" ? "…" : "Синк в игру"}
            </button>
            <button style={{ padding: "3px 10px", fontSize: 12 }} disabled={!!busy || !st.wowPathValid} onClick={() => run("hist", async () => { const r = await api.wowImportHistory(); return `История RCLC: новых ${r.added}`; })}>История</button>
            <button style={{ padding: "3px 10px", fontSize: 12 }} disabled={!!busy || !st.wowPathValid} onClick={() => run("install", async () => { const r = await api.wowInstallAddon(); return `Аддон обновлён (${r.files} файлов) — /reload`; })} title="Установить/обновить аддон">Аддон</button>
          </div>
        </div>
        {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`} style={{ marginBottom: 0 }}>{msg.text}</div>}
      </div>
    );
  }
  return (
    <div className="card">
      {!compact && <h2>Интеграция с WoW</h2>}'''),
])

# ---------- 3. BisSlotList: компактные строки (детали в title), убрать колонку источников
edit('apps/web/src/components/BisSlotList.tsx',[
 ('''                    <td className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }} title={e.sources.map((x) => `${SOURCE_LABEL[x.source]} ${x.list} #${x.rank}${x.score != null ? ` (${x.score})` : ""}`).join("\\n")}>
                      {[...new Set(e.sources.map((x) => SOURCE_LABEL[x.source]))].join(" + ")}
                      <span className="num"> · {e.score}</span>
                      <SimBadge sources={e.sources} />
                    </td>''',
  '''                    <td className="num" style={{ fontSize: 12, whiteSpace: "nowrap", textAlign: "right" }} title={`Источники: ${[...new Set(e.sources.map((x) => SOURCE_LABEL[x.source]))].join(" + ")} · балл ${e.score}\\n${e.sources.map((x) => `${SOURCE_LABEL[x.source]} ${x.list} #${x.rank}${x.score != null ? ` (${x.score})` : ""}`).join("\\n")}`}>
                      <SimBadge sources={e.sources} />
                    </td>'''),
 ('''                    <td className="num muted" style={{ width: 22, padding: "3px 6px" }}>{e.rank}</td>''',
  '''                    <td className="num muted" style={{ width: 22, padding: "3px 6px" }} title={`Балл объединения ${e.score} · ${[...new Set(e.sources.map((x) => SOURCE_LABEL[x.source]))].join(" + ")}`}>{e.rank}</td>'''),
])
# SimBadge: короче — только выбранный/лучший трек в строке, остальное в title
edit('apps/web/src/components/BisSlotList.tsx',[
 ('''  return (
    <div style={{ color: best.pct > 0 ? "var(--ok)" : "var(--text-muted)", fontSize: 11 }} title={parts.map((p) => `${p.text} ${p.tip}`).join("\\n")}>
      сим {parts.map((p) => p.text).join(" · ")}
    </div>
  );''','''  return (
    <div style={{ color: best.pct > 0 ? "var(--ok)" : "var(--text-muted)", fontSize: 12, fontWeight: 600 }} title={"сим по трекам:\\n" + parts.map((p) => `${p.text} ${p.tip}`).join("\\n")}>
      {best.text}
      {parts.length > 1 && <span className="muted" style={{ fontWeight: 400 }}> · {parts.slice(1, 3).map((p) => p.text.split(" (")[0]).join(" · ")}</span>}
    </div>
  );'''),
])
# AltLine короче
edit('apps/web/src/components/SourceChips.tsx',[
 ('''      альт: {f.name} ({KIND_LABEL[f.kind]}{f.sourceName ? ` · ${f.sourceName}` : ""}) {f.pct > 0 ? "+" : ""}
      {f.pct.toFixed(1)}%
      {a.gap != null && <span style={{ color: gapColor }}> · незаменимость ▲{a.gap.toFixed(1)}</span>}
      {a.count > 0 && <span> · ≥95%: {a.count}</span>}''',
  '''      альт. {KIND_LABEL[f.kind]}: {f.name}{f.sourceName ? ` (${f.sourceName})` : ""} {f.pct > 0 ? "+" : ""}{f.pct.toFixed(1)}%
      {a.gap != null && a.gap > 0.05 && <span style={{ color: gapColor }}> · незаменимость ▲{a.gap.toFixed(1)}</span>}
      {a.gap != null && a.gap <= 0.05 && <span> · заменим</span>}'''),
])

# ---------- 4. RaidNight: колонки Альтернатива/Gap компактнее
edit('apps/web/src/pages/RaidNightPage.tsx',[
 ('''                          <td className="muted" style={{ fontSize: 12 }}>
                            {(() => {
                              const a = w.alt?.farmable ?? w.alt?.best;
                              if (!a) return "—";
                              return `${a.name} (${KIND_LABEL[a.kind]}) ${a.pct > 0 ? "+" : ""}${a.pct.toFixed(1)}%`;
                            })()}
                          </td>
                          <td className="num" style={{ color: w.alt?.gap == null ? undefined : w.alt.gap >= 2 ? "var(--ok)" : w.alt.gap >= 0.8 ? "var(--warn)" : "var(--text-muted)", fontWeight: 600 }}>
                            {w.alt?.gap != null ? `▲${w.alt.gap.toFixed(1)}` : ""}
                          </td>''',
  '''                          <td className="muted num" style={{ fontSize: 12, whiteSpace: "nowrap" }} title={(() => { const a = w.alt?.farmable ?? w.alt?.best; return a ? `${a.name} (${KIND_LABEL[a.kind]}${a.sourceName ? ` · ${a.sourceName}` : ""})` : ""; })()}>
                            {(() => {
                              const a = w.alt?.farmable ?? w.alt?.best;
                              if (!a) return "—";
                              return `${a.pct > 0 ? "+" : ""}${a.pct.toFixed(1)}% ${KIND_LABEL[a.kind]}`;
                            })()}
                          </td>
                          <td className="num" style={{ color: w.alt?.gap == null ? undefined : w.alt.gap >= 2 ? "var(--ok)" : w.alt.gap >= 0.8 ? "var(--warn)" : "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }} title="Насколько лучше фармабельной альтернативы">
                            {w.alt?.gap == null ? "" : w.alt.gap > 0.05 ? `▲${w.alt.gap.toFixed(1)}` : <span className="muted" style={{ fontWeight: 400 }}>заменим</span>}
                          </td>'''),
 ('                      <th title="Лучшая фармабельная альтернатива (M+/крафт)">Альтернатива</th>','                      <th title="Лучшая фармабельная альтернатива (M+/крафт): её % и источник; название — при наведении">Альт.</th>'),
])

# ---------- 5. BisPage: пояснения → «?», таблица источников сворачиваемая
edit('apps/web/src/pages/BisPage.tsx',[
 ('''          <div className="muted" style={{ fontSize: 12, maxWidth: 360 }}>
            {status?.progress ? (''','''          <div className="muted" style={{ fontSize: 12, maxWidth: 360 }} title="Icy Veins — авторские BiS-списки (Overall / Raid / M+ / тир / тринкеты). WCL — популярность предметов у топ-парсов Mythic текущего рейда. Итог = взвешенная сумма; персональный сим (SimC/Droptimizer, если свежий) поднимает предметы по % апгрейда.">
            {status?.progress ? ('''),
 ('''              <>
                <div>Icy Veins — авторские BiS-списки (Overall / Raid / M+ / тир / тринкеты).</div>
                <div>WCL — популярность предметов у топ-парсов Mythic текущего рейда{config?.warcraftLogs.hasSecret ? "" : " (нужны ключи в Настройках)"}.</div>
                <div>Итог = взвешенная сумма; персональный Droptimizer (если свежий) поднимает предметы по % апгрейда.</div>
              </>''','''              <span>ⓘ как считается{config?.warcraftLogs.hasSecret ? "" : " · WCL: нужны ключи в Настройках"}</span>'''),
])

# ---------- 6. TierPage: пояснение → title
edit('apps/web/src/pages/TierPage.tsx',[
 ('''      <div className="card" style={{ padding: "10px 14px" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Ценность 2pc/4pc — из автосима (принудительное включение/выключение сет-бонуса в текущем гире персонажа). Приоритет = 4pc × близость к 4pc
          (1 часть → 1.0, 2 → 0.6, 3+ → 0.3; есть 4pc → 0). «⚗» — надет катализируемый предмет в тир-слоте (возможность закрыть часть). Хилы без сима — только прогресс.
        </div>
      </div>''','''      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }} title="Ценность 2pc/4pc — из автосима (принудительное включение/выключение сет-бонуса в текущем гире). Приоритет = 4pc × близость к 4pc (1 часть → 1.0, 2 → 0.6, 3+ → 0.3; есть 4pc → 0). ⚗ — надет катализируемый предмет в тир-слоте. Хилы без сима — только прогресс.">
        ⓘ приоритет = ценность 4pc × близость к 4pc · ⚗ = можно катализировать · наведите для подробностей
      </div>'''),
])
print("ok")
