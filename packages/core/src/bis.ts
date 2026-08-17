/** Типы движка BiS. */

export type BisSource = "icyveins" | "wcl" | "droptimizer" | "simc" | "manual";

/** Персональные сим-источники (привязаны к персонажу, дают % апгрейда). */
export const SIM_SOURCES: readonly BisSource[] = ["droptimizer", "simc"];
export function isSimSource(s: BisSource): boolean {
  return s === "droptimizer" || s === "simc";
}
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
  /** доп. данные источника (simc: dpsBase, dpsMean, dpsDelta, dtpsPct, hpsPct, track, tokenId, slotUsed) */
  meta?: SimCandidateMeta | Record<string, unknown> | null;
}

export interface SimCandidateMeta {
  kind: "simc";
  track: string;
  trackBonusId: number;
  slotUsed: string; // finger1/finger2/…
  tokenId?: number;
  encounterId?: number;
  instanceId?: number;
  base: number; // baseline dps
  mean: number;
  delta: number; // абсолютный прирост
  dtpsPct?: number | null; // танк: изменение входящего урона, % (минус = лучше)
  hpsPct?: number | null;
  role: "dps" | "tank";
  fightStyle: string;
  error?: number; // % ошибка сима
}

export interface BisCandidateRow extends ParsedCandidate {
  id: number;
  source: BisSource;
  specId: number;
  characterId: number | null; // персональные (droptimizer/manual)
  fetchedAt: number;
}

export type ObtainedStatus = "yes" | "lower" | "catalyst" | "no";

/** Тип источника предмета. */
export type SourceKind = "raid" | "mplus" | "vault" | "catalyst" | "craft" | "world" | "other";
export type RaidDifficulty = "normal" | "heroic" | "mythic";
export const RAID_DIFFICULTY_TRACK: Record<RaidDifficulty, string> = { normal: "Champion", heroic: "Hero", mythic: "Myth" };
export const RAID_DIFFICULTY_LABEL: Record<RaidDifficulty, string> = { normal: "Normal", heroic: "Heroic", mythic: "Mythic" };

export interface AltRef {
  itemId: number;
  name: string;
  pct: number;
  kind: SourceKind;
  sourceName: string;
}

export interface BisAlternatives {
  /** лучшая альтернатива из другого источника (любого) */
  best: AltRef | null;
  /** лучшая фармабельная (M+/крафт) */
  farmable: AltRef | null;
  /** незаменимость: pct предмета − pct фармабельной альтернативы (если её нет — pct предмета) */
  gap: number | null;
  /** сколько альтернатив ≥ 95 % ценности предмета */
  count: number;
}

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
  sources: Array<{ source: BisSource; list: BisList; rank: number; score: number | null; note: string | null; meta?: SimCandidateMeta | Record<string, unknown> | null }>;
  /** откуда падает (по справочнику) */
  drops: Array<{ instanceId: number; instanceName: string; encounterId: number; encounterName: string; kind: SourceKind }>;
  /** основной тип источника */
  sourceKind: SourceKind;
  /** трек, на котором предмет BiS по источнику (из bonusID гайда) */
  bisTrack: { name: string; ilvl: number | null } | null;
  /** трек и ilvl предмета для выбранной сложности рейда / M+ */
  dropTrack: { name: string; ilvl: number | null } | null;
  /** % сима по трекам (simc) */
  simByTrack: Record<string, number> | null;
  /** % сима для выбранной сложности (или лучший, если трека нет) */
  simSelected: { track: string | null; pct: number } | null;
  /** лучшее из надетого в слоте: трек/ilvl */
  equippedBest: { ilvl: number | null; track: string | null } | null;
  alternatives: BisAlternatives | null;
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
  upgradePct: number | null; // из персонального сима, если есть (для выбранной сложности)
  equippedIlvl: number | null;
  simTrack?: string | null;
  alt?: BisAlternatives | null;
  sourceKind?: SourceKind;
}

export interface TierRow {
  characterId: number;
  name: string;
  realmName: string;
  classId: number;
  className: string;
  specId: number | null;
  setId: number | null;
  pieces: number;
  owned: string[];
  missing: string[];
  /** надетые не-тир предметы в тир-слотах, пригодные для Катализатора */
  catalyzable: string[];
  val2: number | null; // % ценности 2pc (сим)
  val4: number | null; // % ценности 4pc (сим)
  simAt: number | null;
  toFour: number;
  priority: number | null;
  missingTokens: Array<{ slot: string; itemId: number | null; tokens: Array<{ tokenId: number; name: string; encounterName: string }> }>;
}

export interface TierTokenView {
  tokenId: number;
  name: string;
  icon: string | null;
  instanceName: string;
  encounterName: string;
  wanters: Array<{
    characterId: number; name: string; classId: number; specId: number; slot: string; obtained: ObtainedStatus;
    pieces: number; closes: 0 | 2 | 4 | 5; piecePct: number | null; val4: number | null; priority: number | null;
  }>;
}

export interface BisSourceStatus {
  source: BisSource;
  specs: number; // сколько спек покрыто
  candidates: number;
  lastRun: { at: number; ok: boolean; message: string } | null;
  running: boolean;
}
