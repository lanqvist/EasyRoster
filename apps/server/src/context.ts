import { ConfigService } from "./services/config.js";
import { Db } from "./services/db.js";
import { SyncService } from "./services/sync.js";
import { StaticDataService } from "./services/static-data.js";
import { ItemsService } from "./services/items.js";
import { BisService } from "./services/bis/service.js";
import { WowIntegrationService } from "./services/wow-integration.js";
import { SimService } from "./services/sim/service.js";
import { TierService } from "./services/tier.js";

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
  bis: BisService;
  wow: WowIntegrationService;
  sim: SimService;
  tier: TierService;
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
    // автосим для тех, у кого сменилась экипировка / устарел сим
    const simCfg = config.get().sim;
    if (simCfg.enabled && simCfg.autoAfterSync) {
      const n = sim.enqueue("all", true);
      if (n) log.info(`автосим: в очереди ${n}`);
    }
    // авто-экспорт db.lua после обновления экипировки
    if (config.get().sync.autoExportLua && config.get().wowRetailPath) {
      try {
        wow.exportDbLua();
      } catch (e) {
        log.warn(`auto db.lua: ${(e as Error).message}`);
      }
    }
  };
  sync.periodicTasks = async () => {
    const cfg = config.get();
    // еженедельное обновление Icy Veins для спек ростера
    if (cfg.sync.guidesRefreshDays > 0) {
      const specs = bis.rosterSpecIds();
      const stale = specs.filter((s) => {
        const at = bis.repo.fetchedAt("icyveins", s);
        return !at || Date.now() - at > cfg.sync.guidesRefreshDays * 86400000;
      });
      if (stale.length) await bis.refreshIcyVeins(stale).catch((e) => log.warn(`auto icyveins: ${(e as Error).message}`));
    }
    // подтянуть новую историю лута RCLC, если файл обновился
    if (cfg.wowRetailPath) {
      try {
        const st = wow.status();
        const newest = Math.max(0, ...st.rclcSavedVariables.map((f) => f.mtime));
        if (newest > (st.lastHistoryImportAt ?? 0)) {
          wow.importLootHistory();
          bis.invalidateHistoryCache();
        }
      } catch (e) {
        log.warn(`auto history: ${(e as Error).message}`);
      }
    }
  };
  const bis = new BisService(db, config, staticData, sync.repo, log);
  const wow = new WowIntegrationService(config, db, sync.repo, bis, staticData, log);
  bis.historyProvider = () => wow.wonItemsByPlayer();
  const sim = new SimService(db, config, staticData, sync.repo, bis.repo, log);
  sim.afterSim = async () => {
    if (config.get().sync.autoExportLua && config.get().wowRetailPath) wow.exportDbLua();
  };
  const tier = new TierService(db, config, staticData, sync.repo, bis);
  sim.tierPiecesOf = (c) => tier.progress(c).pieces;
  wow.tierProvider = (c) => {
    const p = tier.progress(c);
    const r = tier.rows().find((x) => x.characterId === c.id);
    return { pieces: p.pieces, val4: r?.val4 ?? null, val2: r?.val2 ?? null };
  };
  return { config, db, sync, staticData, items, bis, wow, sim, tier, log };
}
