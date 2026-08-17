def edit(p, pairs):
    s=open(p,encoding='utf8').read()
    for a,b in pairs:
        if a not in s: raise SystemExit(f"NOT FOUND in {p}: {a[:80]}")
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8').write(s)

# ---------- 1. спеки RU
edit('packages/core/src/wow.ts',[
 ('export const SPEC_BY_ID: ReadonlyMap<number, SpecInfo> = new Map(SPECS.map((s) => [s.id, s]));',
  '''export const SPEC_BY_ID: ReadonlyMap<number, SpecInfo> = new Map(SPECS.map((s) => [s.id, s]));

/** Русские названия спек (как в игре). */
export const SPEC_NAMES_RU: Record<number, string> = {
  250: "Кровь", 251: "Лёд", 252: "Нечестивость",
  577: "Истребление", 581: "Месть", 1480: "Пожиратель",
  102: "Баланс", 103: "Сила зверя", 104: "Страж", 105: "Исцеление",
  1467: "Опустошение", 1468: "Сохранение", 1473: "Насыщение",
  253: "Повелитель зверей", 254: "Стрельба", 255: "Выживание",
  62: "Тайная магия", 63: "Огонь", 64: "Лёд",
  268: "Хмелевар", 270: "Ткач туманов", 269: "Танцующий с ветром",
  65: "Свет", 66: "Защита", 70: "Воздаяние",
  256: "Послушание", 257: "Свет", 258: "Тьма",
  259: "Ликвидация", 260: "Головорез", 261: "Скрытность",
  262: "Стихии", 263: "Совершенствование", 264: "Исцеление",
  265: "Колдовство", 266: "Демонология", 267: "Разрушение",
  71: "Оружие", 72: "Неистовство", 73: "Защита",
};'''),
])
edit('apps/web/src/lib/format.ts',[
 ('  return SPEC_BY_ID.get(specId)?.name ?? `#${specId}`;\n}',
  '  return SPEC_NAMES_RU[specId] ?? SPEC_BY_ID.get(specId)?.name ?? `#${specId}`;\n}'),
 ('import { CLASS_COLORS, CLASS_IDS, CLASS_NAMES_RU, SPEC_BY_ID, type ClassId } from "@easyroster/core";',
  'import { CLASS_COLORS, CLASS_IDS, CLASS_NAMES_RU, SPEC_BY_ID, SPEC_NAMES_RU, type ClassId } from "@easyroster/core";'),
])

# ---------- 2. инстансы/боссы RU: миграция + сервис
s=open('apps/server/src/services/db.ts',encoding='utf8').read()
idx=s.rfind('  `,\n];')
s=s[:idx]+'''  `,
  // v9 — русские названия инстансов и боссов
  `
  ALTER TABLE instances ADD COLUMN name_ru TEXT;
  ALTER TABLE instances ADD COLUMN encounters_ru TEXT;   -- JSON {encounterId: nameRu}
  `,
];'''+s[idx+len('  `,\n];'):]
open('apps/server/src/services/db.ts','w',encoding='utf8').write(s)

edit('apps/server/src/services/static-data.ts',[
 ('  instance(id: number): InstanceRow | undefined {\n    const r = this.db.conn.prepare("SELECT * FROM instances WHERE id = ?").get(id) as any;\n    return r ? { id: r.id, name: r.name, type: r.type, order: r.sort_order, encounters: JSON.parse(r.encounters) } : undefined;\n  }',
  '''  /** Показывать русские названия (locale ru_RU) — применяется ко всем выдачам инстансов/боссов. */
  private get ru(): boolean {
    return this.config.get().locale === "ru_RU";
  }

  private mapInstance(r: any): InstanceRow {
    const encs = JSON.parse(r.encounters) as Array<{ id: number; name: string }>;
    const encRu: Record<string, string> = r.encounters_ru ? JSON.parse(r.encounters_ru) : {};
    const ru = this.ru;
    return {
      id: r.id,
      name: ru && r.name_ru ? r.name_ru : r.name,
      nameEn: r.name,
      type: r.type,
      order: r.sort_order,
      encounters: encs.map((e) => ({ id: e.id, name: ru && encRu[String(e.id)] ? encRu[String(e.id)]! : e.name, nameEn: e.name })),
    };
  }

  instance(id: number): InstanceRow | undefined {
    const r = this.db.conn.prepare("SELECT * FROM instances WHERE id = ?").get(id) as any;
    return r ? this.mapInstance(r) : undefined;
  }

  /** Инстансы без русских названий (для локализации через Blizzard). */
  instancesWithoutRu(ids: number[]): Array<{ id: number; encounters: number[] }> {
    const out: Array<{ id: number; encounters: number[] }> = [];
    for (const id of ids) {
      const r = this.db.conn.prepare("SELECT id, name_ru, encounters, encounters_ru FROM instances WHERE id = ?").get(id) as any;
      if (!r) continue;
      const encs = (JSON.parse(r.encounters) as Array<{ id: number }>).map((e) => e.id).filter((e) => e > 0);
      const have: Record<string, string> = r.encounters_ru ? JSON.parse(r.encounters_ru) : {};
      const missing = encs.filter((e) => !have[String(e)]);
      if (!r.name_ru || missing.length) out.push({ id, encounters: missing });
    }
    return out;
  }

  setInstanceRu(id: number, nameRu: string | null, encountersRu: Record<string, string>): void {
    const r = this.db.conn.prepare("SELECT encounters_ru FROM instances WHERE id = ?").get(id) as any;
    const merged = { ...(r?.encounters_ru ? JSON.parse(r.encounters_ru) : {}), ...encountersRu };
    this.db.conn.prepare("UPDATE instances SET name_ru = COALESCE(?, name_ru), encounters_ru = ? WHERE id = ?").run(nameRu, JSON.stringify(merged), id);
  }'''),
 ('''    return (this.db.conn.prepare("SELECT * FROM instances ORDER BY sort_order, id").all() as any[]).map((r) => ({
      id: r.id, name: r.name, type: r.type, order: r.sort_order, encounters: JSON.parse(r.encounters),
    }));''','''    return (this.db.conn.prepare("SELECT * FROM instances ORDER BY sort_order, id").all() as any[]).map((r) => this.mapInstance(r));'''),
 ('''      .prepare("SELECT s.instance_id, s.encounter_id, i.name AS iname, i.encounters FROM item_sources s LEFT JOIN instances i ON i.id = s.instance_id WHERE s.item_id = ?")
      .all(itemId) as any[];
    return rows.map((r) => {
      const encs = r.encounters ? (JSON.parse(r.encounters) as Array<{ id: number; name: string }>) : [];
      return {
        instanceId: r.instance_id,
        encounterId: r.encounter_id,
        instanceName: r.iname ?? `#${r.instance_id}`,
        encounterName: encs.find((e) => e.id === r.encounter_id)?.name ?? `#${r.encounter_id}`,
      };
    });''','''      .prepare("SELECT s.instance_id, s.encounter_id, i.name AS iname, i.name_ru AS iname_ru, i.encounters, i.encounters_ru FROM item_sources s LEFT JOIN instances i ON i.id = s.instance_id WHERE s.item_id = ?")
      .all(itemId) as any[];
    const ru = this.ru;
    return rows.map((r) => {
      const encs = r.encounters ? (JSON.parse(r.encounters) as Array<{ id: number; name: string }>) : [];
      const encRu: Record<string, string> = r.encounters_ru ? JSON.parse(r.encounters_ru) : {};
      const encEn = encs.find((e) => e.id === r.encounter_id)?.name;
      // для M+ группы (-1) encounterId = id подземелья → берём его русское имя из таблицы инстансов
      let encName = ru && encRu[String(r.encounter_id)] ? encRu[String(r.encounter_id)]! : encEn;
      if (!encName || (ru && !encRu[String(r.encounter_id)] && r.encounter_id > 0 && r.instance_id < 0)) {
        const inner = this.db.conn.prepare("SELECT name, name_ru FROM instances WHERE id = ?").get(r.encounter_id) as any;
        if (inner) encName = ru && inner.name_ru ? inner.name_ru : (encName ?? inner.name);
      }
      return {
        instanceId: r.instance_id,
        encounterId: r.encounter_id,
        instanceName: (ru && r.iname_ru) || r.iname || `#${r.instance_id}`,
        encounterName: encName ?? `#${r.encounter_id}`,
      };
    });'''),
])
edit('packages/core/src/api.ts',[
 ('export interface InstanceRow {\n  id: number;\n  name: string;\n  type: string;\n  order: number | null;\n  encounters: Array<{ id: number; name: string }>;\n}',
  'export interface InstanceRow {\n  id: number;\n  name: string; // локализованное (ru при locale ru_RU)\n  nameEn?: string;\n  type: string;\n  order: number | null;\n  encounters: Array<{ id: number; name: string; nameEn?: string }>;\n}'),
])

# ---------- ItemsService: локализация инстансов/боссов + произвольных предметов
edit('apps/server/src/services/items.ts',[
 ('  /** Гарантировать наличие предметов в справочнике (для экипировки персонажей). */',
  '''  /** Русские названия инстансов и боссов сезона (Blizzard journal API, те же id, что у Raidbots). */
  async localizeSeasonInstances(): Promise<number> {
    const client = this.client();
    if (!client || this.config.get().locale !== "ru_RU") return 0;
    const season = this.config.get().season;
    const ids = [...season.raidInstanceIds, ...season.dungeonInstanceIds];
    const todo = this.staticData.instancesWithoutRu(ids);
    let done = 0;
    for (const t of todo) {
      let nameRu: string | null = null;
      try {
        const r = await client.get<{ name?: string; encounters?: Array<{ id: number; name: string }> }>(`/data/wow/journal-instance/${t.id}`, "static");
        nameRu = r.data?.name ?? null;
        const encRu: Record<string, string> = {};
        for (const e of r.data?.encounters ?? []) encRu[String(e.id)] = e.name;
        // недостающие боссы — точечно
        for (const eid of t.encounters) {
          if (encRu[String(eid)]) continue;
          try {
            const er = await client.get<{ name?: string }>(`/data/wow/journal-encounter/${eid}`, "static");
            if (er.data?.name) encRu[String(eid)] = er.data.name;
          } catch { /* нет такого — пропускаем */ }
        }
        this.staticData.setInstanceRu(t.id, nameRu, encRu);
        done++;
      } catch (e) {
        this.log.warn(`journal-instance ${t.id}: ${(e as Error).message}`);
      }
    }
    if (done) this.log.info(`Локализовано инстансов: ${done}`);
    return done;
  }

  /** Русские имена для произвольного набора предметов (кандидаты BiS вне лут-таблиц сезона, крафт и т.п.). */
  async localizeItems(ids: number[]): Promise<number> {
    const client = this.client();
    if (!client || !this.config.get().locale.startsWith("ru")) return 0;
    const need = this.staticData.itemsWithoutRu(ids);
    if (need.length === 0) return 0;
    const batch: Array<{ id: number; nameRu: string }> = [];
    let idx = 0;
    const worker = async () => {
      while (idx < need.length) {
        const id = need[idx++]!;
        try {
          const r = await client.get<BlizzardItem>(`/data/wow/item/${id}`, "static");
          if (r.data?.name) batch.push({ id, nameRu: r.data.name });
        } catch { /* ignore */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, need.length) }, worker));
    this.staticData.setNamesRu(batch);
    return batch.length;
  }

  /** Гарантировать наличие предметов в справочнике (для экипировки персонажей). */'''),
])
edit('apps/server/src/services/static-data.ts',[
 ('  missingItemIds(ids: number[]): number[] {',
  '''  /** Из набора id — те, что есть в справочнике, но без name_ru. */
  itemsWithoutRu(ids: number[]): number[] {
    const q = this.db.conn.prepare("SELECT name_ru FROM items WHERE id = ?");
    return [...new Set(ids)].filter((id) => {
      const r = q.get(id) as any;
      return r && !r.name_ru;
    });
  }

  missingItemIds(ids: number[]): number[] {'''),
])

# ---------- контекст: вызывать локализацию после статики/синка/IcyVeins
edit('apps/server/src/context.ts',[
 ('  sync.afterCharacterSync = async () => {\n    await items.ensureItems(sync.repo.allEquippedItemIds());',
  '''  sync.afterCharacterSync = async () => {
    await items.ensureItems(sync.repo.allEquippedItemIds());
    await items.localizeItems(sync.repo.allEquippedItemIds());
    await items.localizeSeasonInstances();
    await items.localizeItems(bis.repo.allCandidateItemIds());'''),
])
edit('apps/server/src/services/bis/repo.ts',[
 ('  candidatesForSpec(specId: number, characterId: number | null): BisCandidateRow[] {',
  '''  allCandidateItemIds(): number[] {
    return (this.db.conn.prepare("SELECT DISTINCT item_id FROM bis_candidates").all() as Array<{ item_id: number }>).map((r) => r.item_id);
  }

  candidatesForSpec(specId: number, characterId: number | null): BisCandidateRow[] {'''),
])
edit('apps/server/src/index.ts',[
 ('      .then(() => ctx.items.localizeSeasonItems())','      .then(() => ctx.items.localizeSeasonItems())\n      .then(() => ctx.items.localizeSeasonInstances())'),
])
# роут refresh статики тоже
edit('apps/server/src/routes/loot.ts',[
 ('      void ctx.items.localizeSeasonItems().catch(() => undefined);','      void ctx.items.localizeSeasonItems().then(() => ctx.items.localizeSeasonInstances()).catch(() => undefined);'),
])
print("ok")
