import { z } from "zod";

export const REGIONS = ["eu", "us", "kr", "tw"] as const;
export type Region = (typeof REGIONS)[number];

export const LOCALES = ["ru_RU", "en_US", "en_GB", "de_DE", "fr_FR"] as const;

/** Индекс ранга гильдии: 0 = ГМ … 9. */
export const RankIndexSchema = z.number().int().min(0).max(9);

export const AppConfigSchema = z.object({
  /** true после прохождения мастера первого запуска */
  setupComplete: z.boolean().default(false),

  region: z.enum(REGIONS).default("eu"),
  locale: z.enum(LOCALES).default("ru_RU"),

  guild: z
    .object({
      /** slug реалма как в Blizzard API (например "gordunni") */
      realmSlug: z.string().default(""),
      /** отображаемое имя реалма ("Гордунни") */
      realmName: z.string().default(""),
      /** отображаемое имя гильдии ("Стигма") */
      name: z.string().default(""),
      /** slug гильдии для API ("стигма" → percent-encoded в клиенте) */
      nameSlug: z.string().default(""),
    })
    .default({}),

  /**
   * Индексы рангов, чьи персонажи считаются рейдерами (задаются вручную числами).
   * Пример: [1, 2] — «Статик» и «Рейдер».
   */
  raiderRanks: z.array(RankIndexSchema).default([]),

  /** Ручные подписи рангов: индекс → название (API имён рангов не даёт). */
  rankLabels: z.record(z.string(), z.string()).default({}),

  blizzard: z
    .object({
      clientId: z.string().default(""),
      clientSecret: z.string().default(""),
    })
    .default({}),

  warcraftLogs: z
    .object({
      clientId: z.string().default(""),
      clientSecret: z.string().default(""),
    })
    .default({}),

  /** Путь к папке _retail_ (для генерации db.lua и чтения SavedVariables). */
  wowRetailPath: z.string().default(""),

  /** Текущий сезон: какие инстансы считаем источниками BiS. Пусто → автоопределение из данных Raidbots. */
  season: z
    .object({
      /** id рейдов сезона (journal instance id, напр. 1320 = The Venomous Abyss) */
      raidInstanceIds: z.array(z.number().int()).default([]),
      /** id подземелий M+ сезона (journal instance id) */
      dungeonInstanceIds: z.array(z.number().int()).default([]),
      /** Raidbots seasonId для треков (37 = Midnight S2) */
      seasonId: z.number().int().nullable().default(null),
      /** подпись сезона для UI */
      label: z.string().default(""),
    })
    .default({}),

  /** Настройки движка BiS. */
  bis: z
    .object({
      /** WCL: страниц рейтинга на босса (100 парсов на страницу) */
      wclPagesPerEncounter: z.number().int().min(1).max(5).default(1),
      /** WCL: сложность 5 = mythic, 4 = heroic */
      wclDifficulty: z.number().int().min(3).max(5).default(5),
      /** WCL: минимальная доля (%) предмета, чтобы попасть в кандидаты */
      wclMinSharePct: z.number().min(0).max(100).default(5),
      /** сколько кандидатов показывать на слот */
      perSlot: z.number().int().min(1).max(10).default(4),
      /** веса источников при объединении */
      weights: z
        .object({ icyveins: z.number().default(1), wcl: z.number().default(1), droptimizer: z.number().default(2) })
        .default({}),
      /** дней, после которых персональный сим считается устаревшим */
      simMaxAgeDays: z.number().int().min(1).max(90).default(14),
    })
    .default({}),

  sync: z
    .object({
      /** интервал автосинка персонажей, минуты; 0 = выключено */
      intervalMinutes: z.number().int().min(0).max(1440).default(30),
      /** автообновление BiS-листов Icy Veins, дни; 0 = выключено */
      guidesRefreshDays: z.number().int().min(0).max(60).default(7),
      /** автоматически перезаписывать db.lua аддона после синка/пересчёта (если путь к WoW задан) */
      autoExportLua: z.boolean().default(true),
    })
    .default({}),

  server: z
    .object({
      port: z.number().int().min(1).max(65535).default(4777),
    })
    .default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/** То, что отдаём в UI: секреты заменяем на флаг наличия. */
export type PublicConfig = Omit<AppConfig, "blizzard" | "warcraftLogs"> & {
  blizzard: { clientId: string; hasSecret: boolean };
  warcraftLogs: { clientId: string; hasSecret: boolean };
};

export function toPublicConfig(cfg: AppConfig): PublicConfig {
  const { blizzard, warcraftLogs, ...rest } = cfg;
  return {
    ...rest,
    blizzard: { clientId: blizzard.clientId, hasSecret: blizzard.clientSecret.length > 0 },
    warcraftLogs: { clientId: warcraftLogs.clientId, hasSecret: warcraftLogs.clientSecret.length > 0 },
  };
}

/** Патч конфига из UI: секреты приходят только если пользователь их вводил заново. */
export const ConfigPatchSchema = AppConfigSchema.deepPartial();
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;
