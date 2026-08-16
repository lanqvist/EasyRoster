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
  activeSpecId: number | null;
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

export interface CharacterDetail {
  character: CharacterRow;
  equipment: EquipmentRow[];
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

export interface ApiError {
  error: string;
  details?: unknown;
}
