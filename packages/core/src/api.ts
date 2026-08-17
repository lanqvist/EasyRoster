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

export type ProfileStatus = "pending" | "ok" | "nodata" | "invalid" | "error";

export interface CharacterRow {
  id: number;
  name: string;
  realmSlug: string;
  realmName: string;
  classId: number;
  level: number;
  faction: string | null;
  rank: number;
  inGuild: boolean;
  isRaider: boolean;
  /** эффективная спека: рейдовая (если задана вручную) или обнаруженная в API */
  activeSpecId: number | null;
  /** спека, обнаруженная в Blizzard API */
  detectedSpecId: number | null;
  /** рейдовая спека, заданная вручную (переопределяет обнаруженную) */
  raidSpecId: number | null;
  /** код талантов, заданный вручную (всегда побеждает) */
  talentsOverride: string | null;
  /** ручное исключение/включение в рейдовый ростер */
  rosterOverride: "exclude" | "include" | null;
  /** итог: участвует в рейдовом ростере (ранг + ручные правки) */
  inRaidRoster: boolean;
  ilvlEquipped: number | null;
  ilvlAvg: number | null;
  lastLoginMs: number | null;
  avatarUrl: string | null;
  talentLoadoutCode: string | null;
  profileStatus: ProfileStatus;
  profileMessage: string | null;
  profileSyncedAt: number | null;
  summaryLastModified: string | null;
  rosterSyncedAt: number;
  raceId: number | null;
}

export interface EquipmentRow {
  characterId: number;
  slot: string;
  itemId: number;
  itemName: string | null;
  ilvl: number | null;
  quality: string | null;
  invType: string | null;
  bonusIds: number[];
  context: number | null;
  trackName: string | null;
  enchantId: number | null;
  gems: Array<{ itemId: number; name: string }>;
  emptySockets: number;
  setId: number | null;
  setName: string | null;
}

export interface EquipmentView extends EquipmentRow {
  track: import("./items.js").TrackInfo | null;
  icon: string | null;
}

export interface CharacterDetail {
  character: CharacterRow;
  equipment: EquipmentView[];
}

export interface SyncStatus {
  running: boolean;
  kind: "guild" | "characters" | null;
  progress: { done: number; total: number; current?: string } | null;
  lastGuildSync: { at: number; ok: boolean; message: string } | null;
  lastCharSync: { at: number; ok: boolean; message: string } | null;
  nextAutoSyncAt: number | null;
}

/** Порядок слотов для отображения (как в окне персонажа). */
export const EQUIP_SLOT_ORDER = [
  "HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "SHIRT", "TABARD", "WRIST",
  "HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2",
  "MAIN_HAND", "OFF_HAND",
] as const;

export const EQUIP_SLOT_NAMES_RU: Record<string, string> = {
  HEAD: "Голова", NECK: "Шея", SHOULDER: "Плечи", BACK: "Плащ", CHEST: "Грудь", SHIRT: "Рубашка",
  TABARD: "Гербовая накидка", WRIST: "Запястья", HANDS: "Кисти рук", WAIST: "Пояс", LEGS: "Ноги", FEET: "Ступни",
  FINGER_1: "Кольцо 1", FINGER_2: "Кольцо 2", TRINKET_1: "Аксессуар 1", TRINKET_2: "Аксессуар 2",
  MAIN_HAND: "Правая рука", OFF_HAND: "Левая рука",
};

// ------------------------------------------------------------ фаза 2

export interface ItemRow {
  id: number;
  name: string;
  nameRu: string | null;
  icon: string | null;
  quality: number | null;
  itemClass: number | null;
  itemSubClass: number | null;
  inventoryType: number | null;
  slot: string | null;
  baseIlvl: number | null;
  itemSetId: number | null;
  specs: number[] | null;
  allowableClasses: number[] | null;
  stats: Array<{ id: number; alloc?: number }>;
  contains: number[] | null;
  uniqueEquipped: boolean;
  onUseTrinket: boolean;
  expansion: number | null;
  origin: "raidbots" | "blizzard";
}

export interface InstanceRow {
  id: number;
  name: string; // локализованное (ru при locale ru_RU)
  nameEn?: string;
  type: string;
  order: number | null;
  encounters: Array<{ id: number; name: string; nameEn?: string }>;
}

export interface StaticDataStatus {
  build: string | null;
  updatedAt: number | null;
  items: number;
  instances: number;
  bonuses: number;
  refreshing: boolean;
  lastError: string | null;
  season: { label: string; seasonId: number | null; raids: InstanceRow[]; dungeons: InstanceRow[] };
}

/** Лут инстанса, сгруппированный по боссам. */
export interface LootInstanceView {
  instance: InstanceRow;
  encounters: Array<{ id: number; name: string; items: ItemRow[] }>;
}

// ------------------------------------------------------------ фаза 4

export interface AddonStatus {
  wowPathValid: boolean;
  rclcInstalled: boolean;
  addonInstalled: boolean;
  addonVersion: string | null;
  addonSourceVersion: string | null;
  dataTimestamp: number | null;
  dataCharacters: number;
  lastExportAt: number | null;
  rclcSavedVariables: Array<{ path: string; mtime: number }>;
  easyRosterSavedVariables: Array<{ path: string; mtime: number }>;
  lootHistoryCount: number;
  lastHistoryImportAt: number | null;
}

export interface LootHistoryRow {
  id: string;
  playerKey: string;
  playerDisplay: string;
  itemId: number;
  itemLink: string | null;
  bonusIds: number[];
  response: string | null;
  responseId: number | null;
  boss: string | null;
  instance: string | null;
  difficultyId: number | null;
  mapId: number | null;
  date: string | null;
  time: string | null;
  ts: number | null;
  owner: string | null;
  class: string | null;
  votes: number | null;
}

// ------------------------------------------------------------ фаза 6

export interface SimCharacterState {
  characterId: number;
  name: string;
  supported: boolean;
  reason: string | null;
  lastRunAt: number | null;
  lastOk: boolean | null;
  lastMessage: string | null;
  profilesets: number | null;
  baseline: number | null;
  elapsedMs: number | null;
  stale: boolean;
  equipmentChanged: boolean;
  queued: boolean;
}

export interface SimStatus {
  enabled: boolean;
  simcPath: string | null;
  simcVersion: string | null;
  installing: boolean;
  installMessage: string | null;
  running: boolean;
  current: { characterId: number; name: string; stage: string; startedAt: number } | null;
  queue: number;
  cpuThreads: number;
  characters: SimCharacterState[];
}

export interface ApiError {
  error: string;
  details?: unknown;
}
