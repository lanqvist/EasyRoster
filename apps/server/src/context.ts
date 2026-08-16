import { ConfigService } from "./services/config.js";
import { Db } from "./services/db.js";

export interface AppContext {
  config: ConfigService;
  db: Db;
}

export function createContext(): AppContext {
  return { config: new ConfigService(), db: new Db() };
}
