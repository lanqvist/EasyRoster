import re
def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

# ---------- ItemLink everywhere
edit('apps/web/src/components/BisSlotList.tsx',[
 ('''                    <td style={{ width: 26, padding: "3px 4px" }}>
                      <img src={iconUrl(e.icon, "small")} width={20} height={20} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} loading="lazy" />
                    </td>
                    <td>
                      <a href={wowheadUrl(e.itemId, e.bonusIds, ru ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[e.quality ?? 4] }}>
                        {(ru && e.itemNameRu) || e.itemName}
                      </a>
                      {e.isTier && <span className="muted" style={{ fontSize: 11 }}> · тир</span>}''',
  '''                    <td>
                      <ItemLink itemId={e.itemId} name={(ru && e.itemNameRu) || e.itemName} icon={e.icon} quality={e.quality} bonusIds={e.bonusIds} ru={ru} />
                      {e.isTier && <span className="muted" style={{ fontSize: 11 }}> · тир</span>}'''),
 ('import { AltLine, SourceChips } from "./SourceChips";','import { AltLine, SourceChips } from "./SourceChips";\nimport { ItemLink } from "./ItemLink";'),
])
# equipped mini icons in slot header — leave.

edit('apps/web/src/components/CharacterDrawer.tsx',[
 ('''                          {it && <img src={iconUrl(it.icon, "small")} width={18} height={18} alt="" style={{ verticalAlign: "middle", marginRight: 6, borderRadius: 3 }} />}
                          {it ? (
                            <a
                              href={`https://www.wowhead.com/ru/item=${it.itemId}${it.bonusIds.length ? `?bonus=${it.bonusIds.join(":")}` : ""}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: QUALITY_COLORS[it.quality ?? ""] ?? "inherit" }}
                              title={it.setName ? `Комплект: ${it.setName}` : undefined}
                            >
                              {it.itemName ?? `#${it.itemId}`}
                            </a>
                          ) : (''',
  '''                          {it ? (
                            <ItemLink itemId={it.itemId} name={it.itemName ?? `#${it.itemId}`} icon={it.icon} quality={QUALITY_NUM_BY_TYPE[it.quality ?? ""] ?? 4} bonusIds={it.bonusIds} size={18} />
                          ) : ('''),
 ('''                    <td style={{ width: 24, padding: "2px 4px" }}>{it && <img src={iconUrl(it.icon, "small")} width={18} height={18} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} loading="lazy" />}</td>
                    <td>
                      <a href={wowheadUrl(r.itemId, r.bonusIds, ru ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[it?.quality ?? 4] }}>
                        {(ru && it?.nameRu) || it?.name || `#${r.itemId}`}
                      </a>''',
  '''                    <td>
                      <ItemLink itemId={r.itemId} name={(ru && it?.nameRu) || it?.name || `#${r.itemId}`} icon={it?.icon} quality={it?.quality} bonusIds={r.bonusIds} ru={ru} size={18} />'''),
 ('import { useConfig } from "../lib/config-context";','import { useConfig } from "../lib/config-context";\nimport { ItemLink } from "./ItemLink";\n\nconst QUALITY_NUM_BY_TYPE: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };'),
 # width of drawer + link to full page
 ('        style={{ width: 560, maxWidth: "100%", height: "100%", overflowY: "auto", background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", padding: 20 }}',
  '        style={{ width: "min(1100px, 95vw)", height: "100%", overflowY: "auto", background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", padding: 20 }}'),
])
# sim results table: header cell for icon removed → adjust thead: find "<th></th>\n                <th>Предмет</th>" in SimResults
s=open('apps/web/src/components/CharacterDrawer.tsx',encoding='utf8').read()
s=s.replace('''                <th></th>
                <th>Предмет</th>
                <th>Слот</th>
                <th>Трек</th>''','''                <th>Предмет</th>
                <th>Слот</th>
                <th>Трек</th>''',1)
open('apps/web/src/components/CharacterDrawer.tsx','w',encoding='utf8').write(s)

edit('apps/web/src/pages/RaidNightPage.tsx',[
 ('''                    <td style={{ width: 26, padding: "3px 4px" }}>
                      <img src={iconUrl(it.icon, "small")} width={20} height={20} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} />
                    </td>
                    <td>
                      <span style={{ color: QUALITY_COLORS_NUM[it.quality ?? 4] }}>{(ru && it.nameRu) || it.name}</span>''',
  '''                    <td>
                      <ItemLink itemId={it.id} name={(ru && it.nameRu) || it.name} icon={it.icon} quality={it.quality} ru={ru} />'''),
 ('''                <img src={iconUrl(selectedItem.icon, "small")} width={20} height={20} alt="" style={{ borderRadius: 3, verticalAlign: "middle", marginRight: 6 }} />
                <a href={wowheadUrl(selectedItem.id, [], ru ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[selectedItem.quality ?? 4] }}>
                  {(ru && selectedItem.nameRu) || selectedItem.name}
                </a>''',
  '''                <ItemLink itemId={selectedItem.id} name={(ru && selectedItem.nameRu) || selectedItem.name} icon={selectedItem.icon} quality={selectedItem.quality} ru={ru} />'''),
 ('import { KIND_LABEL } from "../components/SourceChips";','import { KIND_LABEL } from "../components/SourceChips";\nimport { ItemLink } from "../components/ItemLink";'),
])
edit('apps/web/src/pages/LootPage.tsx',[
 ('''      <td style={{ width: 28, padding: "3px 6px" }}>
        <img src={iconUrl(item.icon, "small")} width={22} height={22} alt="" style={{ borderRadius: 3, verticalAlign: "middle" }} loading="lazy" />
      </td>
      <td>
        <a href={wowheadUrl(item.id, [], locale.startsWith("ru") ? "ru" : "en")} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS_NUM[item.quality ?? 4] }}>
          {name}
        </a>''',
  '''      <td>
        <ItemLink itemId={item.id} name={name} icon={item.icon} quality={item.quality} ru={locale.startsWith("ru")} size={22} />'''),
 ('import { OBTAINED_STYLE } from "../components/BisSlotList";','import { OBTAINED_STYLE } from "../components/BisSlotList";\nimport { ItemLink } from "../components/ItemLink";'),
])

# ---------- BisSlotList: две колонки слотов на широком экране
edit('apps/web/src/components/BisSlotList.tsx',[
 ('        <div key={s.slot} style={{ marginBottom: 10 }}>','        <div key={s.slot} style={{ marginBottom: 10, breakInside: "avoid" }}>'),
])
s=open('apps/web/src/components/BisSlotList.tsx',encoding='utf8').read()
# оборачивающий контейнер: найдём return ( <div> {view.slots.map
s=s.replace('''  return (
    <div>
      {view.slots.map((s) => (''','''  return (
    <div className="bis-slot-grid">
      {view.slots.map((s) => (''',1)
open('apps/web/src/components/BisSlotList.tsx','w',encoding='utf8').write(s)
css=open('apps/web/src/styles.css',encoding='utf8').read()
css+='''
/* BiS-лист: две колонки на широких экранах */
.bis-slot-grid { display: grid; grid-template-columns: 1fr; gap: 0 18px; }
@media (min-width: 1000px) { .bis-slot-grid { grid-template-columns: 1fr 1fr; } }
.item-link:hover { text-decoration: underline; }
/* тултип Wowhead поверх выезжающей карточки */
.wowhead-tooltip { z-index: 10000 !important; }
'''
open('apps/web/src/styles.css','w',encoding='utf8').write(css)

# ---------- Settings tabs
edit('apps/web/src/pages/SettingsPage.tsx',[
 ('  return (\n    <div>\n      <h1>Настройки</h1>\n      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}\n',
  '''  const TABS: Array<[string, string]> = [["guild", "Гильдия и ранги"], ["keys", "Ключи API"], ["sim", "Автосим"], ["local", "Синхронизация"], ["wow", "Интеграция с WoW"]];
  const show = (t: string): React.CSSProperties | undefined => (tab === t ? undefined : { display: "none" });
  return (
    <div>
      <h1>Настройки</h1>
      <div className="row" style={{ marginBottom: 14, gap: 6 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "primary" : undefined} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {msg && <div className={`alert ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}
'''),
])
s=open('apps/web/src/pages/SettingsPage.tsx',encoding='utf8').read()
s=s.replace('  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);','  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);\n  const [tab, setTab] = useState<string>(() => localStorage.getItem("easyroster.settingsTab") ?? "guild");\n  useEffect(() => localStorage.setItem("easyroster.settingsTab", tab), [tab]);',1)
if 'useEffect' not in s.split('\n')[0]:
    s=s.replace('import { useState } from "react";','import { useEffect, useState } from "react";',1)
# привязка карточек к вкладкам по заголовкам
def tag(s, h2, t):
    i=s.index('<h2>'+h2+'</h2>')
    j=s.rfind('<div className="card">',0,i)
    return s[:j]+'<div className="card" style={show("'+t+'")}>'+s[j+len('<div className="card">'):]
for h2,t in [('Гильдия','guild'),('Ранги рейдеров','guild'),('Ключи API','keys'),('Автосим SimulationCraft','sim'),('Локально','local')]:
    s=tag(s,h2,t)
s=s.replace('''      <button className="primary" disabled={busy} onClick={submit}>
        {busy ? "Сохраняю…" : "Сохранить"}
      </button>

      <div style={{ marginTop: 24 }}>
        <WowIntegrationCard />
      </div>''','''      {tab !== "wow" && (
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
      )}

      <div style={show("wow")}>
        <WowIntegrationCard />
      </div>''')
open('apps/web/src/pages/SettingsPage.tsx','w',encoding='utf8').write(s)
print("ok")
