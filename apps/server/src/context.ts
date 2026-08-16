import { ConfigService } from "./services/config.js";
import { Db } from "./services/db.js";
import { SyncService } from "./services/sync.js";
import { StaticDataService } from "./services/static-data.js";
import { ItemsService } from "./services/items.js";

export interface Logger {
  info: (m: string) => void;
  warn: (m: string) => void;
  error: (m: string) => void;
}

export interface AppContext {
  config: ConfigService;
  db: Db;
  sync: SyncService;
  staticData: StaticDataService;
  items: ItemsService;
  log: Logger;
}

export function createContext(log: Logger, opts: { dbPath?: string } = {}): AppContext {
  const config = new ConfigService();
  const db = new Db(opts.dbPath);
  const sync = new SyncService(config, db, log);
  const staticData = new StaticDataService(db, config, log);
  const items = new ItemsService(config, staticData, log);
  sync.afterCharacterSync = async () => {
    await items.ensureItems(sync.repo.allEquippedItemIds());
  };
  return { config, db, sync, staticData, items, log };
}
