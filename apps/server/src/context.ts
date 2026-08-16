import { ConfigService } from "./services/config.js";
import { Db } from "./services/db.js";
import { SyncService } from "./services/sync.js";

export interface AppContext {
  config: ConfigService;
  db: Db;
  sync: SyncService;
}

export function createContext(log: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }): AppContext {
  const config = new ConfigService();
  const db = new Db();
  const sync = new SyncService(config, db, log);
  return { config, db, sync };
}
