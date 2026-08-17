def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

edit('packages/core/src/bis.ts',[
 ('  coverage: BisCharacterView["coverage"] | null;\n  perSlot: Record<string, ObtainedStatus | "none">;\n}',
  '''  coverage: BisCharacterView["coverage"] | null;
  perSlot: Record<string, ObtainedStatus | "none">;
  /** лучший кандидат слота: % сима (для выбранной сложности) и название — для тепловой карты */
  perSlotBest: Record<string, { pct: number | null; name: string; obtained: ObtainedStatus } | null>;
  hasSim: boolean;
  simAt: number | null;
  role: "TANK" | "HEALER" | "DAMAGER" | null;
}'''),
])
edit('apps/server/src/services/bis/service.ts',[
 ('  team(): BisTeamRow[] {\n    const rows: BisTeamRow[] = [];\n    for (const c of this.chars.listRaiders()) {\n      const view = this.characterBis(c);\n      const perSlot: Record<string, ObtainedStatus | "none"> = {};',
  '''  team(difficulty?: RaidDifficulty): BisTeamRow[] {
    const rows: BisTeamRow[] = [];
    for (const c of this.chars.listRaiders()) {
      const view = this.characterBis(c, undefined, { difficulty });
      const perSlot: Record<string, ObtainedStatus | "none"> = {};
      const perSlotBest: BisTeamRow["perSlotBest"] = {};'''),
 ('''          const order: ObtainedStatus[] = ["yes", "lower", "catalyst", "no"];
          perSlot[s.slot] = best.map((b) => b.obtained).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]!;''',
  '''          const order: ObtainedStatus[] = ["yes", "lower", "catalyst", "no"];
          perSlot[s.slot] = best.map((b) => b.obtained).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]!;
          const top = best.find((b) => b.obtained !== "yes") ?? best[0]!;
          perSlotBest[s.slot] = { pct: top.simSelected?.pct ?? null, name: top.itemNameRu ?? top.itemName, obtained: top.obtained };'''),
 ('''        coverage: view?.coverage ?? null,
        perSlot,
      });''','''        coverage: view?.coverage ?? null,
        perSlot,
        perSlotBest,
        hasSim: !!view?.personalSim,
        simAt: view?.personalSim?.fetchedAt ?? null,
        role: c.activeSpecId ? SPEC_BY_ID.get(c.activeSpecId)?.role ?? null : null,
      });'''),
])
edit('apps/server/src/routes/bis.ts',[
 ('  app.get("/api/bis/team", async () => ctx.bis.team());',
  '''  app.get("/api/bis/team", async (req) => {
    const q = z.object({ difficulty: z.enum(["normal", "heroic", "mythic"]).optional() }).parse(req.query);
    return ctx.bis.team(q.difficulty);
  });'''),
])
edit('apps/web/src/lib/api.ts',[
 ('  bisTeam: () => request<BisTeamRow[]>("/api/bis/team"),','  bisTeam: (difficulty?: string) => request<BisTeamRow[]>(`/api/bis/team${difficulty ? `?difficulty=${difficulty}` : ""}`),'),
])
print("ok")
