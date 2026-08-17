def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

# migration v10
s=open('apps/server/src/services/db.ts',encoding='utf8').read()
idx=s.rfind('  `,\n];')
s=s[:idx]+'''  `,
  // v10 — ручное включение/исключение из рейдового ростера
  `
  ALTER TABLE characters ADD COLUMN roster_override TEXT;   -- 'exclude' | 'include' | NULL
  `,
];'''+s[idx+len('  `,\n];'):]
open('apps/server/src/services/db.ts','w',encoding='utf8').write(s)

RAIDER_WHERE = "in_guild = 1 AND ((is_raider = 1 AND (roster_override IS NULL OR roster_override <> 'exclude')) OR roster_override = 'include')"
edit('apps/server/src/services/characters-repo.ts',[
 ('      .prepare("SELECT * FROM characters WHERE in_guild = 1 AND is_raider = 1 ORDER BY rank, name")',
  f'      .prepare("SELECT * FROM characters WHERE {RAIDER_WHERE} ORDER BY rank, name")'),
 ('      ? "SELECT * FROM characters WHERE in_guild = 1 AND is_raider = 1 ORDER BY rank, name"',
  f'      ? "SELECT * FROM characters WHERE {RAIDER_WHERE} ORDER BY rank, name"'),
 ('    talentsOverride: r.talents_override ?? null,','    talentsOverride: r.talents_override ?? null,\n    rosterOverride: r.roster_override ?? null,\n    inRaidRoster: !!r.in_guild && ((!!r.is_raider && r.roster_override !== "exclude") || r.roster_override === "include"),'),
 ('  setOverrides(id: number, o: { raidSpecId?: number | null; talentsOverride?: string | null }): void {',
  '''  setOverrides(id: number, o: { raidSpecId?: number | null; talentsOverride?: string | null; rosterOverride?: "exclude" | "include" | null }): void {
    if (o.rosterOverride !== undefined) this.db.conn.prepare("UPDATE characters SET roster_override = ? WHERE id = ?").run(o.rosterOverride, id);'''),
])
edit('packages/core/src/api.ts',[
 ('  /** код талантов, заданный вручную (всегда побеждает) */\n  talentsOverride: string | null;',
  '''  /** код талантов, заданный вручную (всегда побеждает) */
  talentsOverride: string | null;
  /** ручное исключение/включение в рейдовый ростер */
  rosterOverride: "exclude" | "include" | null;
  /** итог: участвует в рейдовом ростере (ранг + ручные правки) */
  inRaidRoster: boolean;'''),
])
edit('apps/server/src/routes/roster.ts',[
 ('    const body = z.object({ raidSpecId: z.number().int().nullable().optional(), talentsOverride: z.string().nullable().optional() }).parse(req.body ?? {});',
  '    const body = z.object({ raidSpecId: z.number().int().nullable().optional(), talentsOverride: z.string().nullable().optional(), rosterOverride: z.enum(["exclude", "include"]).nullable().optional() }).parse(req.body ?? {});'),
])
edit('apps/web/src/lib/api.ts',[
 ('  characterSettings: (id: number, body: { raidSpecId?: number | null; talentsOverride?: string | null }) =>',
  '  characterSettings: (id: number, body: { raidSpecId?: number | null; talentsOverride?: string | null; rosterOverride?: "exclude" | "include" | null }) =>'),
])
# Roster page: column with toggle; excluded shown greyed in "вся гильдия"
edit('apps/web/src/pages/RosterPage.tsx',[
 ('                <th>Профиль</th>\n              </tr>','                <th>Профиль</th>\n                <th title="Участие в рейдовом ростере (BiS, сим, экспорт в аддон)">В рейде</th>\n              </tr>'),
 ('''                    <td style={{ color: st.color }} title={r.profileMessage ?? undefined}>
                      {st.text}
                    </td>
                  </tr>''','''                    <td style={{ color: st.color }} title={r.profileMessage ?? undefined}>
                      {st.text}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        style={{ padding: "1px 8px", fontSize: 11, color: r.inRaidRoster ? "var(--ok)" : "var(--text-muted)" }}
                        title={r.rosterOverride === "exclude" ? "Исключён вручную — вернуть" : r.rosterOverride === "include" ? "Добавлен вручную — убрать" : r.inRaidRoster ? "Убрать из рейдового ростера" : "Добавить в рейдовый ростер вручную"}
                        onClick={async () => {
                          const next: "exclude" | "include" | null = r.inRaidRoster ? (r.isRaider ? "exclude" : null) : r.isRaider ? null : "include";
                          await api.characterSettings(r.id, { rosterOverride: next });
                          await load();
                        }}
                      >
                        {r.inRaidRoster ? "да" : "нет"}{r.rosterOverride ? " ✎" : ""}
                      </button>
                    </td>
                  </tr>'''),
 ('                  <tr key={r.id} className={selected === r.id ? "selected" : undefined} style={{ cursor: "pointer" }} onClick={() => setSelected(r.id)}>',
  '                  <tr key={r.id} className={selected === r.id ? "selected" : undefined} style={{ cursor: "pointer", opacity: r.inRaidRoster ? 1 : 0.55 }} onClick={() => setSelected(r.id)}>'),
 ('    const raiders = rows.filter((r) => r.isRaider);','    const raiders = rows.filter((r) => r.inRaidRoster);'),
])
print("ok")
