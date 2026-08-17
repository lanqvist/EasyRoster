import { DatabaseSync } from "node:sqlite";
import { DB_PATH, ensureDataDirs } from "../paths.js";

/**
 * SQLite через встроенный node:sqlite (Node ≥ 22.13, без нативной сборки).
 * Миграции — простой список SQL с номером версии в user_version.
 */
const MIGRATIONS: string[] = [
  // v1 — фаза 0: служебные таблицы
  `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,           -- blizzard | wcl | guides | raidbots | lua-export | sv-import
    started_at INTEGER NOT NULL,  -- unix ms
    finished_at INTEGER,
    ok INTEGER,                   -- 1/0
    message TEXT
  );
  `,
  // v2 — фаза 1: персонажи гильдии и экипировка
  `
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY,               -- Blizzard character id
    name TEXT NOT NULL,
    realm_slug TEXT NOT NULL,
    realm_name TEXT NOT NULL DEFAULT '',
    class_id INTEGER NOT NULL,
    level INTEGER NOT NULL DEFAULT 0,
    faction TEXT,
    rank INTEGER NOT NULL DEFAULT 99,     -- индекс ранга гильдии
    in_guild INTEGER NOT NULL DEFAULT 1,
    is_raider INTEGER NOT NULL DEFAULT 0,
    -- профиль
    active_spec_id INTEGER,
    ilvl_equipped REAL,
    ilvl_avg REAL,
    last_login_ms INTEGER,
    avatar_url TEXT,
    talent_loadout_code TEXT,
    profile_status TEXT NOT NULL DEFAULT 'pending',  -- pending | ok | nodata | invalid | error
    profile_message TEXT,
    profile_synced_at INTEGER,            -- unix ms, последний успешный синк профиля
    summary_last_modified TEXT,           -- заголовок Last-Modified для If-Modified-Since
    roster_synced_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_characters_raider ON characters(is_raider, in_guild);

  CREATE TABLE IF NOT EXISTS equipment (
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot TEXT NOT NULL,                   -- HEAD, NECK, ... (Blizzard slot.type)
    item_id INTEGER NOT NULL,
    item_name TEXT,
    ilvl INTEGER,
    quality TEXT,
    inv_type TEXT,
    bonus_ids TEXT NOT NULL DEFAULT '[]', -- JSON массив
    context INTEGER,
    track_name TEXT,                      -- name_description ("Герой" и т.п.)
    enchant_id INTEGER,
    gems TEXT NOT NULL DEFAULT '[]',      -- JSON: [{itemId, name}]
    empty_sockets INTEGER NOT NULL DEFAULT 0,
    set_id INTEGER,
    set_name TEXT,
    PRIMARY KEY (character_id, slot)
  );
  `,
  // v3 — фаза 2: справочники предметов и лут-таблиц (Raidbots static data)
  `
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,                   -- en
    name_ru TEXT,
    icon TEXT,
    quality INTEGER,
    item_class INTEGER,
    item_subclass INTEGER,
    inventory_type INTEGER,
    slot TEXT,                            -- канонический слот EasyRoster
    base_ilvl INTEGER,
    item_set_id INTEGER,
    specs TEXT,                           -- JSON [specId] | NULL
    allowable_classes TEXT,               -- JSON [classId] | NULL
    stats TEXT,                           -- JSON [{id, alloc}]
    contains TEXT,                        -- JSON [itemId] для токенов
    unique_equipped INTEGER,
    on_use_trinket INTEGER,
    expansion INTEGER,
    origin TEXT NOT NULL DEFAULT 'raidbots'   -- raidbots | blizzard
  );
  CREATE INDEX IF NOT EXISTS idx_items_set ON items(item_set_id);

  CREATE TABLE IF NOT EXISTS item_sources (
    item_id INTEGER NOT NULL,
    instance_id INTEGER NOT NULL,
    encounter_id INTEGER NOT NULL,
    PRIMARY KEY (item_id, instance_id, encounter_id)
  );
  CREATE INDEX IF NOT EXISTS idx_item_sources_inst ON item_sources(instance_id, encounter_id);

  CREATE TABLE IF NOT EXISTS instances (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,                   -- raid | mplus-chest | expansion-dungeon | ...
    sort_order INTEGER,
    encounters TEXT NOT NULL              -- JSON [{id, name}]
  );
  `,
  // v4 — фаза 3: движок BiS
  `
  CREATE TABLE IF NOT EXISTS bis_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                 -- icyveins | wcl | droptimizer | manual
    spec_id INTEGER NOT NULL,
    character_id INTEGER,                 -- NULL = общий для спеки
    list TEXT NOT NULL,                   -- overall | raid | mplus | tier | trinkets | sim | manual
    slot TEXT NOT NULL,
    rank INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    bonus_ids TEXT NOT NULL DEFAULT '[]',
    original_item_id INTEGER,
    item_name TEXT,
    source_note TEXT,
    score REAL,
    fetched_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bis_cand_spec ON bis_candidates(spec_id, source, character_id);
  CREATE INDEX IF NOT EXISTS idx_bis_cand_item ON bis_candidates(item_id);

  CREATE TABLE IF NOT EXISTS bis_source_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    spec_id INTEGER,                      -- NULL = все спеки
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    ok INTEGER,
    message TEXT
  );

  -- ручные правки: закрепить/убрать предмет для персонажа или спеки
  CREATE TABLE IF NOT EXISTS bis_manual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER,                 -- NULL = для всей спеки
    spec_id INTEGER NOT NULL,
    slot TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    action TEXT NOT NULL,                 -- pin | exclude
    note TEXT,
    created_at INTEGER NOT NULL
  );

  -- персональные симы (Raidbots Droptimizer и т.п.)
  CREATE TABLE IF NOT EXISTS sim_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    spec_id INTEGER,
    kind TEXT NOT NULL,                   -- droptimizer | topgear | simc
    report_id TEXT,
    url TEXT,
    sim_date INTEGER,
    imported_at INTEGER NOT NULL,
    baseline_dps REAL,
    fight_style TEXT,
    meta TEXT                             -- JSON
  );
  CREATE INDEX IF NOT EXISTS idx_sim_reports_char ON sim_reports(character_id, imported_at);
  `,
  // v5 — фаза 4: история лута RCLootCouncil, заметки гильдии
  `
  CREATE TABLE IF NOT EXISTS loot_history (
    id TEXT PRIMARY KEY,                  -- RCLC id "servertime-counter"
    player_key TEXT NOT NULL,             -- "имя-Реалм" как в RCLC (нормализованный lower)
    player_display TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    item_link TEXT,
    bonus_ids TEXT NOT NULL DEFAULT '[]',
    response TEXT,
    response_id INTEGER,
    boss TEXT,
    instance TEXT,
    difficulty_id INTEGER,
    map_id INTEGER,
    date TEXT,                            -- YYYY/MM/DD
    time TEXT,
    ts INTEGER,                           -- unix ms (из даты/времени)
    owner TEXT,
    class TEXT,
    votes INTEGER,
    is_award_reason INTEGER,
    imported_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_loot_history_player ON loot_history(player_key, item_id);
  CREATE INDEX IF NOT EXISTS idx_loot_history_ts ON loot_history(ts);

  ALTER TABLE characters ADD COLUMN public_note TEXT;
  ALTER TABLE characters ADD COLUMN officer_note TEXT;
  ALTER TABLE characters ADD COLUMN rank_name TEXT;
  `,
  // v6 — фаза 6: автосим SimulationCraft
  `
  ALTER TABLE characters ADD COLUMN race_id INTEGER;
  ALTER TABLE bis_candidates ADD COLUMN meta TEXT;
  CREATE TABLE IF NOT EXISTS sim_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    spec_id INTEGER,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    ok INTEGER,
    message TEXT,
    profilesets INTEGER,
    baseline REAL,
    elapsed_ms INTEGER,
    equipment_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sim_runs_char ON sim_runs(character_id, id);
  `,
  // v7 — фаза 7: ценность тир-сета из сима
  `
  ALTER TABLE sim_runs ADD COLUMN tier_pieces INTEGER;
  ALTER TABLE sim_runs ADD COLUMN tier2_pct REAL;
  ALTER TABLE sim_runs ADD COLUMN tier4_pct REAL;
  `,
  // v8 — рейдовая спека и таланты вручную
  `
  ALTER TABLE characters ADD COLUMN raid_spec_id INTEGER;
  ALTER TABLE characters ADD COLUMN talents_override TEXT;
  `,
  // v9 — русские названия инстансов и боссов
  `
  ALTER TABLE instances ADD COLUMN name_ru TEXT;
  ALTER TABLE instances ADD COLUMN encounters_ru TEXT;   -- JSON {encounterId: nameRu}
  `,
  // v10 — ручное включение/исключение из рейдового ростера
  `
  ALTER TABLE characters ADD COLUMN roster_override TEXT;   -- 'exclude' | 'include' | NULL
  `,
];

export class Db {
  readonly conn: DatabaseSync;

  constructor(path: string = DB_PATH) {
    ensureDataDirs();
    this.conn = new DatabaseSync(path);
    this.conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    const row = this.conn.prepare("PRAGMA user_version").get() as { user_version: number };
    let version = row.user_version;
    while (version < MIGRATIONS.length) {
      this.conn.exec("BEGIN");
      try {
        this.conn.exec(MIGRATIONS[version]!);
        version += 1;
        this.conn.exec(`PRAGMA user_version = ${version}`);
        this.conn.exec("COMMIT");
      } catch (e) {
        this.conn.exec("ROLLBACK");
        throw e;
      }
    }
  }

  getMeta(key: string): string | undefined {
    const r = this.conn.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value;
  }

  setMeta(key: string, value: string): void {
    this.conn
      .prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  close(): void {
    this.conn.close();
  }
}
