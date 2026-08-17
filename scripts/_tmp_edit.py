def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

edit('apps/web/src/lib/api.ts',[
 ('  character: (id: number) => request<CharacterDetail>(`/api/characters/${id}`),',
  '''  character: (id: number) => request<CharacterDetail>(`/api/characters/${id}`),
  characterSettings: (id: number, body: { raidSpecId?: number | null; talentsOverride?: string | null }) =>
    request<CharacterRow>(`/api/characters/${id}/settings`, { method: "PUT", body: JSON.stringify(body) }),'''),
])

# Drawer: блок «Рейдовая спека / таланты» под шапкой
edit('apps/web/src/components/CharacterDrawer.tsx',[
 ('            <div className="row" style={{ marginBottom: 10, gap: 6 }}>\n              <button className={tab === "gear" ? "primary" : undefined} onClick={() => setTab("gear")}>Экипировка</button>',
  '''            <RaidSpecBox character={c} onSaved={() => { void load(); void loadBis(); }} />
            <div className="row" style={{ marginBottom: 10, gap: 6 }}>
              <button className={tab === "gear" ? "primary" : undefined} onClick={() => setTab("gear")}>Экипировка</button>'''),
 ('function SimResults(','''function RaidSpecBox({ character, onSaved }: { character: CharacterDetail["character"]; onSaved: () => void }) {
  const [raidSpec, setRaidSpec] = useState<number | "">(character.raidSpecId ?? "");
  const [talents, setTalents] = useState(character.talentsOverride ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const specs = SPECS.filter((s) => s.classId === character.classId);
  const changed = (raidSpec === "" ? null : raidSpec) !== character.raidSpecId || (talents.trim() || null) !== (character.talentsOverride ?? null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.characterSettings(character.id, { raidSpecId: raidSpec === "" ? null : raidSpec, talentsOverride: talents.trim() || null });
      setMsg("Сохранено — BiS пересчитан, сим поставится в очередь при следующем запуске");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ padding: "8px 12px", marginBottom: 10 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Рейдовая спека</label>
          <select value={raidSpec} onChange={(e) => setRaidSpec(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">как в API ({specName(character.detectedSpecId)})</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.id === character.detectedSpecId ? " (в API)" : ""}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
          <label>Таланты для сима (код из игры; пусто = по настройке)</label>
          <input value={talents} onChange={(e) => setTalents(e.target.value)} placeholder="C4QA…" style={{ fontFamily: "var(--mono)", fontSize: 11 }} />
        </div>
        <button className={changed ? "primary" : undefined} disabled={busy || !changed} onClick={save}>Сохранить</button>
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{msg}</div>}
    </div>
  );
}

function SimResults('''),
])
s=open('apps/web/src/components/CharacterDrawer.tsx',encoding='utf8').read()
if 'SPECS' not in s.split('\n')[1]:
    s=s.replace('import { SLOT_NAMES_RU, wowheadUrl,','import { SPECS, SLOT_NAMES_RU, wowheadUrl,',1)
open('apps/web/src/components/CharacterDrawer.tsx','w',encoding='utf8').write(s)

# Roster: пометка переопределённой спеки
edit('apps/web/src/pages/RosterPage.tsx',[
 ('                      {r.activeSpecId ? <span className="muted"> · {specName(r.activeSpecId)}</span> : null}',
  '''                      {r.activeSpecId ? <span className="muted"> · {specName(r.activeSpecId)}</span> : null}
                      {r.raidSpecId && r.raidSpecId !== r.detectedSpecId ? <span className="muted" style={{ fontSize: 11 }} title="Рейдовая спека задана вручную"> (API: {specName(r.detectedSpecId)})</span> : null}'''),
])

# Settings: источник талантов
edit('apps/web/src/pages/SettingsPage.tsx',[
 ('    tierSetName: config?.sim.tierSetName ?? "",\n  }));','    tierSetName: config?.sim.tierSetName ?? "",\n    talentsSource: config?.sim.talentsSource ?? "simc-profile",\n  }));'),
 ('''          <div className="field">
            <label>Имя сет-бонуса в SimC (пусто = авто, напр. mid2)</label>''','''          <div className="field">
            <label>Таланты для сима</label>
            <select value={sim.talentsSource} onChange={(e) => setSim({ ...sim, talentsSource: e.target.value as typeof sim.talentsSource })}>
              <option value="simc-profile">Штатный рейдовый профиль SimC (single-target)</option>
              <option value="character">Таланты персонажа из Blizzard API</option>
            </select>
            <span className="hint">Ручной код талантов в карточке персонажа побеждает в любом случае</span>
          </div>
          <div className="field">
            <label>Имя сет-бонуса в SimC (пусто = авто, напр. mid2)</label>'''),
])
print("ok")
