import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { CACHE_DIR } from "../../paths.js";

/**
 * Обёртка над SimulationCraft CLI:
 *  - поиск/установка simc.exe (nightly с downloads.simulationcraft.org → data/cache/simc/<build>/),
 *  - запуск с входным файлом, чтение прогресса и json2-отчёта.
 */
const NIGHTLY = process.env.EASYROSTER_SIMC_NIGHTLY ?? "http://downloads.simulationcraft.org/nightly/";

export interface SimcInfo {
  path: string | null;
  version: string | null;
  source: "config" | "cache" | "path" | null;
}

export interface SimcRunResult {
  json: any;
  elapsedMs: number;
  stdoutTail: string;
}

export class SimcRunner {
  installing = false;
  installMessage: string | null = null;

  constructor(private readonly log: { info: (m: string) => void; warn: (m: string) => void }) {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  get dir(): string {
    return path.join(CACHE_DIR, "simc");
  }

  /** Найти simc: явный путь из конфига → скачанный в кэш → PATH (simc.exe рядом не ищем). */
  locate(configPath: string): SimcInfo {
    if (configPath && fs.existsSync(configPath)) return { path: configPath, version: this.versionOf(configPath), source: "config" };
    const builds = fs.existsSync(this.dir) ? fs.readdirSync(this.dir).filter((d) => fs.existsSync(path.join(this.dir, d, this.exeName))) : [];
    builds.sort().reverse();
    if (builds[0]) return { path: path.join(this.dir, builds[0], this.exeName), version: builds[0], source: "cache" };
    return { path: null, version: null, source: null };
  }

  private get exeName(): string {
    return process.platform === "win32" ? "simc.exe" : "simc";
  }

  private versionOf(p: string): string | null {
    const dir = path.basename(path.dirname(p));
    return /simc-\d+/.test(dir) ? dir : null;
  }

  /** Последняя сборка win64 из индекса nightly. */
  async latestNightly(): Promise<{ file: string; url: string; build: string }> {
    const res = await fetch(NIGHTLY);
    if (!res.ok) throw new Error(`nightly index HTTP ${res.status}`);
    const html = await res.text();
    const files = [...html.matchAll(/href="(simc-(\d+)[.-]([0-9a-z.]+)-win64\.7z)"/gi)].map((m) => ({ file: m[1]!, major: Number(m[2]), tag: m[3]! }));
    if (files.length === 0) throw new Error("В индексе nightly не найдено сборок win64");
    // сортировка: по номеру патча, затем по позиции в списке (последний — новее)
    files.sort((a, b) => a.major - b.major);
    const best = files[files.length - 1]!;
    return { file: best.file, url: new URL(best.file, NIGHTLY).toString(), build: best.file.replace(/-win64\.7z$/, "") };
  }

  /** Скачать и распаковать последнюю сборку. Возвращает путь к simc.exe. */
  async install(onProgress?: (msg: string) => void): Promise<string> {
    if (this.installing) throw new Error("Установка SimulationCraft уже идёт");
    this.installing = true;
    try {
      const latest = await this.latestNightly();
      const target = path.join(this.dir, latest.build);
      const exe = path.join(target, this.exeName);
      if (fs.existsSync(exe)) return exe;
      const archive = path.join(this.dir, latest.file);
      onProgress?.(`Скачиваю ${latest.file}…`);
      this.installMessage = `Скачиваю ${latest.file}`;
      const res = await fetch(latest.url);
      if (!res.ok || !res.body) throw new Error(`nightly ${res.status}`);
      const total = Number(res.headers.get("content-length") ?? 0);
      const fh = fs.openSync(archive, "w");
      let got = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        fs.writeSync(fh, value);
        got += value.length;
        if (total) this.installMessage = `Скачиваю ${latest.file}: ${Math.round((got / total) * 100)}%`;
      }
      fs.closeSync(fh);
      onProgress?.("Распаковываю…");
      this.installMessage = "Распаковываю…";
      await extract7z(archive, this.dir);
      // архив содержит папку simc-<build>-win64/
      const extractedDir = path.join(this.dir, `${latest.build}-win64`);
      if (fs.existsSync(extractedDir)) {
        // оставляем только нужное: simc.exe + лицензии (GUI Qt весит сотни МБ)
        fs.mkdirSync(target, { recursive: true });
        for (const f of fs.readdirSync(extractedDir)) {
          if (f === this.exeName || /^LICENSE|^COPYING/i.test(f) || f === "profiles") {
            fs.cpSync(path.join(extractedDir, f), path.join(target, f), { recursive: true });
          }
        }
        fs.rmSync(extractedDir, { recursive: true, force: true });
      }
      fs.rmSync(archive, { force: true });
      if (!fs.existsSync(exe)) throw new Error("После распаковки simc.exe не найден");
      this.installMessage = null;
      this.log.info(`SimulationCraft установлен: ${exe}`);
      return exe;
    } finally {
      this.installing = false;
    }
  }

  /** Запуск simc с входным файлом; результат json2 читается из outputJson. */
  run(exe: string, inputFile: string, cwd: string, outputJson: string, opts: { onProgress?: (line: string) => void; timeoutMs?: number } = {}): Promise<SimcRunResult> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn(exe, [inputFile], { cwd, windowsHide: true });
      let tail = "";
      const onData = (buf: Buffer) => {
        const text = buf.toString("utf8");
        tail = (tail + text).slice(-4000);
        const line = text.split(/[\r\n]+/).filter(Boolean).pop();
        if (line && opts.onProgress) opts.onProgress(line);
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`simc: таймаут ${Math.round((opts.timeoutMs ?? 0) / 1000)} с`));
      }, opts.timeoutMs ?? 30 * 60_000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`simc завершился с кодом ${code}: ${tail.slice(-600)}`));
        try {
          const json = JSON.parse(fs.readFileSync(outputJson, "utf8"));
          resolve({ json, elapsedMs: Date.now() - started, stdoutTail: tail });
        } catch (e) {
          reject(new Error(`simc: не удалось прочитать ${outputJson}: ${(e as Error).message}`));
        }
      });
    });
  }
}

async function extract7z(archive: string, dest: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const sevenZip = require("7zip-min") as { unpack: (src: string, dest: string, cb: (err: Error | null) => void) => void };
  await new Promise<void>((resolve, reject) => sevenZip.unpack(archive, dest, (err) => (err ? reject(err) : resolve())));
}
