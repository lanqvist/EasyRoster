import fs from "node:fs";
import { AppConfigSchema, ConfigPatchSchema, type AppConfig, type ConfigPatch } from "@easyroster/core";
import { CONFIG_PATH, ensureDataDirs } from "../paths.js";

/** Хранилище конфига: data/config.json. Секреты лежат здесь же (локальный инструмент). */
export class ConfigService {
  private cfg: AppConfig;

  constructor() {
    ensureDataDirs();
    this.cfg = ConfigService.load();
  }

  private static load(): AppConfig {
    if (!fs.existsSync(CONFIG_PATH)) {
      const cfg = AppConfigSchema.parse({});
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
      return cfg;
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return AppConfigSchema.parse(raw);
  }

  get(): AppConfig {
    return this.cfg;
  }

  /** Глубокое слияние патча; пустые строки секретов не затирают существующие. */
  update(patchInput: unknown): AppConfig {
    // zod при разборе частичного патча подставляет .default() соседним полям вложенных объектов
    // (например, season.raidInstanceIds = []) — оставляем только те ключи, что реально пришли в патче
    const patch = pruneToInput(ConfigPatchSchema.parse(patchInput), patchInput) as ConfigPatch;
    const merged = deepMerge(this.cfg as unknown as Record<string, unknown>, sanitizeSecrets(patch, this.cfg));
    this.cfg = AppConfigSchema.parse(merged);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.cfg, null, 2), "utf8");
    return this.cfg;
  }
}

function sanitizeSecrets(patch: ConfigPatch, current: AppConfig): Record<string, unknown> {
  const p = structuredClone(patch) as Record<string, any>;
  for (const key of ["blizzard", "warcraftLogs"] as const) {
    if (p[key] && typeof p[key] === "object") {
      if (p[key].clientSecret === "" || p[key].clientSecret === undefined) {
        p[key].clientSecret = current[key].clientSecret;
      }
    }
  }
  return p;
}

/** Оставить в разобранном патче только ключи, присутствовавшие во входных данных (рекурсивно). */
export function pruneToInput(parsed: unknown, input: unknown): unknown {
  if (!isPlainObject(parsed) || !isPlainObject(input)) return parsed;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(input)) {
    if (!(k in parsed)) continue;
    out[k] = pruneToInput(parsed[k], input[k]);
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
