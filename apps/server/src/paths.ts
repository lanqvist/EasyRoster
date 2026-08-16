import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Корень репозитория (apps/server/src|dist → ../../..). */
export const REPO_ROOT = path.resolve(here, "..", "..", "..");

/** Каталог данных пользователя (config.json, easyroster.sqlite, кэши). Переопределяется EASYROSTER_DATA_DIR. */
export const DATA_DIR = process.env.EASYROSTER_DATA_DIR
  ? path.resolve(process.env.EASYROSTER_DATA_DIR)
  : path.join(REPO_ROOT, "data");

export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const DB_PATH = path.join(DATA_DIR, "easyroster.sqlite");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

/** Собранный фронтенд (apps/web/dist). */
export const WEB_DIST = path.join(REPO_ROOT, "apps", "web", "dist");

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
