/** Общие типы HTTP API между сервером и UI. */

export interface HealthResponse {
  ok: true;
  version: string;
  setupComplete: boolean;
  dbPath: string;
}

export interface RealmOption {
  slug: string;
  name: string;
  id: number;
}

/** Результат проверки ключей Blizzard + поиска гильдии в мастере настройки. */
export interface GuildProbeResult {
  guild: { name: string; nameSlug: string; realmSlug: string; realmName: string; memberCount: number; faction: string };
  /** индекс ранга → количество персонажей 80+ уровня и всего */
  ranks: Array<{ rank: number; total: number; maxLevel: number }>;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
