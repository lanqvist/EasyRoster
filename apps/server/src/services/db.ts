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
