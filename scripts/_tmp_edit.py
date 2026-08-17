def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

edit('apps/server/src/services/wow-integration.ts',[
 ('  buildExportData(): { data: Record<string, Record<number, ExportEntry>>; characters: number } {',
  '''  /** Прогресс тира персонажа (устанавливается контекстом из TierService). */
  tierProvider: ((c: CharacterRow) => { pieces: number; val4: number | null; val2: number | null }) | null = null;

  buildExportData(): { data: Record<string, Record<number, ExportEntry>>; characters: number } {'''),
 ('      const key = rclcKeyForExport(c.name, c.realmName || c.realmSlug);\n      const map: Record<number, ExportEntry> = {};',
  '''      const key = rclcKeyForExport(c.name, c.realmName || c.realmSlug);
      const map: Record<number, ExportEntry> = {};
      const tier = this.tierProvider ? this.tierProvider(c) : null;'''),
 ('          if (e.isTier) entry.t = 1;',
  '''          if (e.isTier) {
            entry.t = 1;
            if (tier) {
              entry.tp = tier.pieces;
              if (tier.val4 != null) entry.t4 = Math.round(tier.val4 * 10) / 10;
              if (tier.val2 != null) entry.t2 = Math.round(tier.val2 * 10) / 10;
              const next = tier.pieces + 1;
              entry.tc = next === 2 ? 2 : next === 4 ? 4 : 0;
            }
          }'''),
 ('  sk?: string; // тип источника самого предмета\n',
  '''  sk?: string; // тип источника самого предмета
  tp?: number; // частей тира надето
  t4?: number; // ценность 4pc, %
  t2?: number; // ценность 2pc, %
  tc?: number; // эта часть закроет: 2 / 4 / 0
'''),
])
s=open('apps/server/src/services/wow-integration.ts',encoding='utf8').read()
if 'type CharacterRow' not in s.split('\n')[3] and 'CharacterRow' not in s[:600]:
    s=s.replace('  isSimSource, rclcKeyForExport, type AddonStatus,','  isSimSource, rclcKeyForExport, type AddonStatus, type CharacterRow,',1)
open('apps/server/src/services/wow-integration.ts','w',encoding='utf8').write(s)

edit('apps/server/src/context.ts',[
 ('  sim.tierPiecesOf = (c) => tier.progress(c).pieces;',
  '''  sim.tierPiecesOf = (c) => tier.progress(c).pieces;
  wow.tierProvider = (c) => {
    const p = tier.progress(c);
    const r = tier.rows().find((x) => x.characterId === c.id);
    return { pieces: p.pieces, val4: r?.val4 ?? null, val2: r?.val2 ?? null };
  };'''),
])

# addon
edit('addon/RCLootCouncil_EasyRoster/core.lua',[
 ('''	if entry.c == 1 then text = text .. " |cff9a9dab(→катализ.)|r" end''','''	if entry.c == 1 then text = text .. " |cff9a9dab(→катализ.)|r" end
	if entry.tc == 4 then text = text .. " |cff4fbf7aзакроет 4pc|r" elseif entry.tc == 2 then text = text .. " |cffe0b64aзакроет 2pc|r" end'''),
 ('''	if entry.t == 1 then tinsert(lines, "Тир-предмет") end''','''	if entry.t == 1 then
		local tl = "Тир-предмет"
		if entry.tp then tl = tl .. string.format(" · надето %d/5", entry.tp) end
		if entry.t4 then tl = tl .. string.format(" · 4pc = %+.1f%%", entry.t4) end
		if entry.t2 then tl = tl .. string.format(" · 2pc = %+.1f%%", entry.t2) end
		if entry.tc == 4 then tl = tl .. " · |cff4fbf7aэта часть закроет 4pc|r" elseif entry.tc == 2 then tl = tl .. " · закроет 2pc" end
		tinsert(lines, tl)
	end'''),
])
print("ok")
