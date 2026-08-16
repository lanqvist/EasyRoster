import type { ConfigService } from "./config.js";
import { BlizzardClient } from "./blizzard.js";
import type { StaticDataService } from "./static-data.js";

interface BlizzardItem {
  id: number;
  name: string;
  quality?: { type: string };
  level?: number;
  item_class?: { id: number };
  item_subclass?: { id: number };
  inventory_type?: { type: string };
  preview_item?: { set?: { item_set?: { id: number } } };
  media?: { id: number };
}

const QUALITY_TYPE_TO_NUM: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6, HEIRLOOM: 7 };
const INV_TYPE_STR_TO_NUM: Record<string, number> = {
  HEAD: 1, NECK: 2, SHOULDER: 3, BODY: 4, CHEST: 5, WAIST: 6, LEGS: 7, FEET: 8, WRIST: 9, HAND: 10, FINGER: 11, TRINKET: 12,
  WEAPON: 13, SHIELD: 14, RANGED: 15, CLOAK: 16, TWOHWEAPON: 17, TABARD: 19, ROBE: 20, WEAPONMAINHAND: 21, WEAPONOFFHAND: 22,
  HOLDABLE: 23, THROWN: 25, RANGEDRIGHT: 26,
};

/** Дополнение справочника предметов данными Blizzard API (имена ru_RU, предметы вне лут-таблиц). */
export class ItemsService {
  private busy = false;

  constructor(
    private readonly config: ConfigService,
    private readonly staticData: StaticDataService,
    private readonly log: { info: (m: string) => void; warn: (m: string) => void },
  ) {}

  private client(): BlizzardClient | null {
    const cfg = this.config.get();
    if (!cfg.blizzard.clientId || !cfg.blizzard.clientSecret) return null;
    return new BlizzardClient(cfg.blizzard, cfg.region, cfg.locale);
  }

  /** Русские имена для предметов инстансов сезона (locale из конфига). */
  async localizeSeasonItems(): Promise<number> {
    if (this.busy) return 0;
    const client = this.client();
    if (!client) return 0;
    if (this.config.get().locale === "en_US" || this.config.get().locale === "en_GB") return 0;
    const ids = this.staticData.seasonItemsWithoutRu();
    if (ids.length === 0) return 0;
    this.busy = true;
    let done = 0;
    try {
      const batch: Array<{ id: number; nameRu: string }> = [];
      const CONC = 6;
      let idx = 0;
      const worker = async () => {
        while (idx < ids.length) {
          const id = ids[idx++]!;
          try {
            const r = await client.get<BlizzardItem>(`/data/wow/item/${id}`, "static");
            if (r.data?.name) batch.push({ id, nameRu: r.data.name });
          } catch (e) {
            this.log.warn(`item ${id}: ${(e as Error).message}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONC, ids.length) }, worker));
      this.staticData.setNamesRu(batch);
      done = batch.length;
      this.log.info(`Локализовано предметов: ${done}/${ids.length}`);
    } finally {
      this.busy = false;
    }
    return done;
  }

  /** Гарантировать наличие предметов в справочнике (для экипировки персонажей). */
  async ensureItems(ids: number[]): Promise<number> {
    const missing = this.staticData.missingItemIds(ids);
    if (missing.length === 0) return 0;
    const client = this.client();
    if (!client) return 0;
    let added = 0;
    const CONC = 6;
    let idx = 0;
    const worker = async () => {
      while (idx < missing.length) {
        const id = missing[idx++]!;
        try {
          const [itemRes, mediaRes] = await Promise.all([
            client.get<BlizzardItem>(`/data/wow/item/${id}`, "static"),
            client.get<{ assets?: Array<{ key: string; value: string }> }>(`/data/wow/media/item/${id}`, "static").catch(() => ({ data: null })),
          ]);
          const it = itemRes.data;
          if (!it) continue;
          const iconUrl = mediaRes.data?.assets?.find((a) => a.key === "icon")?.value ?? null;
          const icon = iconUrl ? iconUrl.split("/").pop()!.replace(/\.jpg$/, "") : null;
          this.staticData.upsertBlizzardItem({
            id: it.id,
            name: it.name,
            nameRu: it.name,
            icon,
            quality: it.quality ? QUALITY_TYPE_TO_NUM[it.quality.type] ?? null : null,
            itemClass: it.item_class?.id ?? null,
            itemSubClass: it.item_subclass?.id ?? null,
            inventoryType: it.inventory_type ? INV_TYPE_STR_TO_NUM[it.inventory_type.type] ?? null : null,
            baseIlvl: it.level ?? null,
            itemSetId: it.preview_item?.set?.item_set?.id ?? null,
          });
          added++;
        } catch (e) {
          this.log.warn(`ensureItems ${id}: ${(e as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, missing.length) }, worker));
    return added;
  }
}
