/** Типы движка BiS. */

export type BisSource = "icyveins" | "wcl" | "droptimizer" | "manual";
export type BisList = "overall" | "raid" | "mplus" | "tier" | "trinkets" | "sim" | "manual";

/** Кандидат из источника (до объединения). */
export interface ParsedCandidate {
  list: BisList;
  slot: string; // канонический слот (HEAD … FINGER, TRINKET, MAIN_HAND, OFF_HAND)
  rank: number; // 1 = лучший в списке
  itemId: number;
  bonusIds: number[];
  originalItemId: number | null; // для катализатора: id рейдового предмета-источника
  itemName: string | null;
  sourceNote: string | null; // «Ula'tek», «Coiled Altar + Catalyst», «S tier» …
  score: number | null; // популярность % (wcl) или % апгрейда (sim)
}

export interface BisCandidateRow extends ParsedCandidate {
  id: number;
  source: BisSource;
  specId: number;
  characterId: number | null; // персональные (droptimizer/manual)
  fetchedAt: number;
}

export type ObtainedStatus = "yes" | "lower" | "catalyst" | "no";

export interface BisEntry {
  slot: string;
  rank: number; // итоговое место в слоте (1 = BiS)
  itemId: number;
  itemName: string;
  itemNameRu: string | null;
  icon: string | null;
  quality: number | null;
  bonusIds: number[];
  originalItemId: number | null;
  score: number; // итоговый балл объединения
  sources: Array<{ source: BisSource; list: BisList; rank: number; score: number | null; note: string | null }>;
  /** откуда падает (по справочнику) */
  drops: Array<{ instanceId: number; instanceName: string; encounterId: number; encounterName: string }>;
  obtained: ObtainedStatus;
  obtainedDetail: string | null; // «Герой 4/6», «есть рейдовый предмет — нужен Катализатор» …
  isTier: boolean;
}

export interface BisSlotView {
  slot: string;
  entries: BisEntry[];
  /** что надето сейчас (может быть 2 предмета для колец/тринкетов/оружия) */
  equipped: Array<{ itemId: number; itemName: string | null; icon: string | null; ilvl: number | null; track: string | null; setId: number | null }>;
}

export interface BisCharacterView {
  characterId: number;
  specId: number;
  slots: BisSlotView[];
  coverage: { slots: number; obtained: number; lower: number; pct: number };
  sourcesUsed: Array<{ source: BisSource; fetchedAt: number | null; count: number }>;
  personalSim: { fetchedAt: number; label: string } | null;
}

/** Строка сводки по статику. */
export interface BisTeamRow {
  characterId: number;
  name: string;
  realmName: string;
  classId: number;
  specId: number | null;
  ilvl: number | null;
  coverage: BisCharacterView["coverage"] | null;
  perSlot: Record<string, ObtainedStatus | "none">;
}

/** Кому нужен предмет (для лут-таблиц и лут-ночи). */
export interface ItemWanter {
  characterId: number;
  name: string;
  realmName: string;
  classId: number;
  specId: number;
  slot: string;
  rank: number;
  score: number;
  obtained: ObtainedStatus;
  obtainedDetail: string | null;
  upgradePct: number | null; // из персонального сима, если есть
  equippedIlvl: number | null;
}

export interface BisSourceStatus {
  source: BisSource;
  specs: number; // сколько спек покрыто
  candidates: number;
  lastRun: { at: number; ok: boolean; message: string } | null;
  running: boolean;
}
