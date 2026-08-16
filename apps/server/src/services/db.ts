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
