import fs from "node:fs";
import path from "node:path";
import {
  isSimSource, rclcKeyForExport, type AddonStatus, type LootHistoryRow, type ItemWanter } from "@easyroster/core";
import { REPO_ROOT } from "../paths.js";
import type { ConfigService } from "./config.js";
import type { Db } from "./db.js";
import type { Logger } from "../context.js";
import { parseSavedVariables, toLua, luaString, type LuaValue } from "./lua/parse.js";
import type { CharactersRepo } from "./characters-repo.js";
import type { BisService } from "./bis/service.js";
import type { StaticDataService } from "./static-data.js";

const ADDON_NAME = "RCLootCouncil_EasyRoster";
const ADDON_SRC = path.join(REPO_ROOT, "addon", ADDON_NAME);

/**
 * Интеграция с локальной установкой WoW:
 *  - установка/обновление аддона RCLootCouncil_EasyRoster в Interface\AddOns;
 *  - генерация Data\db.lua (BiS-карта персонажей) — читается аддоном после /reload;
 *  - чтение SavedVariables: история лута RCLootCouncil, экспорт гильдии (ранги/заметки) из EasyRosterDB.
 */
export class WowIntegrationService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: Db,
    private readonly chars: CharactersRepo,
    private readonly bis: BisService,
    private readonly staticData: StaticDataService,
    private readonly log: Logger,
  ) {}

  // ------------------------------------------------------------ пути

  private retail(): string | null {
    const p = this.config.get().wowRetailPath;
    if (!p) return null;
    return fs.existsSync(path.join(p, "Interface")) || fs.existsSync(path.join(p, "WTF")) ? p : null;
  }
  private addonDir(): string | null {
    const r = this.retail();
    return r ? path.join(r, "Interface", "AddOns", ADDON_NAME) : null;
  }
  private savedVariableFiles(name: string): string[] {
    const r = this.retail();
    if (!r) return [];
    const acc = path.join(r, "WTF", "Account");
    if (!fs.existsSync(acc)) return [];
    const out: string[] = [];
    for (const a of fs.readdirSync(acc)) {
      const f = path.join(acc, a, "SavedVariables", `${name}.lua`);
      if (fs.existsSync(f)) out.push(f);
    }
    return out;
  }

  status(): AddonStatus {
    const retail = this.retail();
    const dir = this.addonDir();
    const installed = !!dir && fs.existsSync(path.join(dir, `${ADDON_NAME}.toc`));
    const dbFile = dir ? path.join(dir, "Data", "db.lua") : null;
    let dataTimestamp: number | null = null;
    if (dbFile && fs.existsSync(dbFile)) {
      const m = /EasyRosterTimestamp\s*=\s*(\d+)/.exec(fs.readFileSync(dbFile, "utf8").slice(0, 500));
      if (m) dataTimestamp = Number(m[1]) * 1000;
    }
    const rclcInstalled = !!retail && fs.existsSync(path.join(retail, "Interface", "AddOns", "RCLootCouncil", "RCLootCouncil.toc"));
    let installedVersion: string | null = null;
    if (installed && dir) {
      const m = /## Version:\s*(\S+)/.exec(fs.readFileSync(path.join(dir, `${ADDON_NAME}.toc`), "utf8"));
      installedVersion = m?.[1] ?? null;
    }
    const srcVersion = /## Version:\s*(\S+)/.exec(fs.readFileSync(path.join(ADDON_SRC, `${ADDON_NAME}.toc`), "utf8"))?.[1] ?? null;
    const rclcFiles = this.savedVariableFiles("RCLootCouncil");
    const erFiles = this.savedVariableFiles(ADDON_NAME);
    return {
      wowPathValid: !!retail,
      rclcInstalled,
      addonInstalled: installed,
      addonVersion: installedVersion,
      addonSourceVersion: srcVersion,
      dataTimestamp,
      dataCharacters: Number(this.db.getMeta("lua.export.characters") ?? 0),
      lastExportAt: Number(this.db.getMeta("lua.export.at") ?? 0) || null,
      rclcSavedVariables: rclcFiles.map((f) => ({ path: f, mtime: fs.statSync(f).mtimeMs })),
      easyRosterSavedVariables: erFiles.map((f) => ({ path: f, mtime: fs.statSync(f).mtimeMs })),
      lootHistoryCount: (this.db.conn.prepare("SELECT COUNT(*) n FROM loot_history").get() as { n: number }).n,
      lastHistoryImportAt: Number(this.db.getMeta("history.import.at") ?? 0) || null,
    };
  }

  // ------------------------------------------------------------ установка аддона

  installAddon(): { dir: string; files: number } {
    const dir = this.addonDir();
    if (!dir) throw new Error("Путь к WoW не задан или неверен (Настройки → Путь к _retail_)");
    fs.mkdirSync(path.join(dir, "Data"), { recursive: true });
    fs.mkdirSync(path.join(dir, "Modules"), { recursive: true });
    let files = 0;
    const copy = (rel: string) => {
      const src = path.join(ADDON_SRC, rel);
      if (!fs.existsSync(src)) return;
      fs.copyFileSync(src, path.join(dir, rel));
      files++;
    };
    for (const f of fs.readdirSync(ADDON_SRC)) if (f.endsWith(".lua") || f.endsWith(".toc")) copy(f);
    for (const f of fs.readdirSync(path.join(ADDON_SRC, "Modules"))) copy(path.join("Modules", f));
    // db.lua не перезаписываем, если уже есть сгенерированный
    if (!fs.existsSync(path.join(dir, "Data", "db.lua"))) copy(path.join("Data", "db.lua"));
    this.log.info(`Аддон установлен: ${dir} (${files} файлов)`);
    return { dir, files };
  }

  // ------------------------------------------------------------ экспорт db.lua

  /**
   * Собрать карту: ключ RCLC персонажа → itemID → запись.
   * Записи создаются для самого BiS-предмета, для рейдового предмета-источника (катализатор)
   * и для тир-токенов, содержащих BiS-предмет.
   */
  buildExportData(): { data: Record<string, Record<number, ExportEntry>>; characters: number } {
    const data: Record<string, Record<number, ExportEntry>> = {};
    const raiders = this.chars.listRaiders();
    // токены: itemId тир-предмета → токены, которые его содержат
    const tokenByContent = new Map<number, number[]>();
    for (const inst of this.staticData.seasonInfo().raids) {
      for (const it of this.staticData.instanceLoot(inst.id)) {
        if (it.contains) for (const c of it.contains) tokenByContent.set(c, [...(tokenByContent.get(c) ?? []), it.id]);
      }
    }
    let count = 0;
    for (const c of raiders) {
      const view = this.bis.characterBis(c);
      if (!view) continue;
      const key = rclcKeyForExport(c.name, c.realmName || c.realmSlug);
      const map: Record<number, ExportEntry> = {};
      for (const s of view.slots) {
        for (const e of s.entries) {
          const sims = e.sources.filter((x) => isSimSource(x.source) && x.score != null);
          const sim = sims.length ? sims.reduce((a, b) => ((b.score ?? -1e9) > (a.score ?? -1e9) ? b : a)) : undefined;
          const entry: ExportEntry = {
            r: e.rank,
            s: e.obtained === "yes" ? "y" : e.obtained === "lower" ? "l" : e.obtained === "catalyst" ? "c" : "n",
            sl: s.slot,
            sc: Math.round(e.score),
            sp: view.specId,
          };
          if (sim?.score != null) entry.p = Math.round(sim.score * 10) / 10;
          if (sim?.meta && (sim.meta as any).kind === "simc") {
            const m = sim.meta as any;
            if (typeof m.delta === "number") entry.dd = Math.round(m.delta);
            if (m.role === "tank") {
              if (typeof m.dtpsPct === "number") entry.dt = Math.round(m.dtpsPct * 10) / 10;
              if (typeof m.hpsPct === "number") entry.hp = Math.round(m.hpsPct * 10) / 10;
            }
            const pt: Record<string, number> = {};
            for (const x of sims) {
              const mm = x.meta as any;
              if (mm?.kind === "simc" && mm.track && x.score != null) pt[mm.track] = Math.round(x.score * 10) / 10;
            }
            if (Object.keys(pt).length > 1) entry.pt = pt;
          }
          if (e.obtainedDetail) entry.d = e.obtainedDetail;
          if (e.isTier) entry.t = 1;
          const put = (id: number, extra: Partial<ExportEntry> = {}) => {
            const prev = map[id];
            const next = { ...entry, ...extra };
            if (!prev || prev.r > next.r) map[id] = next;
          };
          put(e.itemId);
          if (e.originalItemId) put(e.originalItemId, { c: 1 });
          for (const tok of tokenByContent.get(e.itemId) ?? []) put(tok, { k: 1 });
        }
      }
      if (Object.keys(map).length) {
        data[key] = map;
        count++;
      }
    }
    return { data, characters: count };
  }

  renderDbLua(): { lua: string; characters: number } {
    const { data, characters } = this.buildExportData();
    const cfg = this.config.get();
    const ts = Math.floor(Date.now() / 1000);
    const lines: string[] = [];
    lines.push("-- Сгенерировано EasyRoster. Не редактировать вручную. После обновления файла нужен /reload.");
    lines.push(`EasyRosterTimestamp = ${ts}`);
    lines.push(`EasyRosterSeason = ${luaString(cfg.season.label || "")}`);
    lines.push(`EasyRosterGuild = ${luaString(cfg.guild.name || "")}`);
    lines.push("-- Формат: [\"Имя-Реалм\"] = { [itemID] = { r=ранг в слоте, s=y|l|c|n (есть/ниже трек/катализатор/нет), sl=слот, sc=балл, sp=спека, p=% апгрейда, d=детали, t=1 тир, c=1 источник для катализатора, k=1 тир-токен } }");
    // bonusID → название трека (для определения сложности выпавшего предмета в игре)
    const tracks: Record<number, string> = {};
    for (const b of this.staticData.getBonuses().values()) {
      const u = b.upgrade;
      if (!u) continue;
      if (cfg.season.seasonId != null ? u.seasonId !== cfg.season.seasonId : u.seasonId == null) continue;
      tracks[b.id] = u.name;
    }
    lines.push("EasyRosterTracks = " + toLua(tracks));
    lines.push("EasyRosterData = " + toLua(data));
    return { lua: lines.join("\n") + "\n", characters };
  }

  exportDbLua(): { path: string; characters: number; bytes: number } {
    const dir = this.addonDir();
    if (!dir) throw new Error("Путь к WoW не задан или неверен");
    if (!fs.existsSync(path.join(dir, `${ADDON_NAME}.toc`))) this.installAddon();
    const { lua, characters } = this.renderDbLua();
    const file = path.join(dir, "Data", "db.lua");
    fs.writeFileSync(file, lua, "utf8");
    this.db.setMeta("lua.export.at", String(Date.now()));
    this.db.setMeta("lua.export.characters", String(characters));
    this.log.info(`db.lua записан: ${characters} персонажей, ${lua.length} байт`);
    return { path: file, characters, bytes: lua.length };
  }

  // ------------------------------------------------------------ импорт истории лута RCLC

  importLootHistory(): { files: number; entries: number; added: number } {
    const files = this.savedVariableFiles("RCLootCouncil");
    let entries = 0;
    let added = 0;
    const ins = this.db.conn.prepare(`
      INSERT OR IGNORE INTO loot_history(id, player_key, player_display, item_id, item_link, bonus_ids, response, response_id, boss, instance,
        difficulty_id, map_id, date, time, ts, owner, class, votes, is_award_reason, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    for (const f of files) {
      let parsed: Record<string, LuaValue>;
      try {
        parsed = parseSavedVariables(fs.readFileSync(f, "utf8"));
      } catch (e) {
        this.log.warn(`SavedVariables ${f}: ${(e as Error).message}`);
        continue;
      }
      const lootDb = parsed.RCLootCouncilLootDB as any;
      const fr = lootDb?.factionrealm as Record<string, Record<string, any[]>> | undefined;
      if (!fr) continue;
      this.db.conn.exec("BEGIN");
      try {
        for (const players of Object.values(fr)) {
          if (!players || typeof players !== "object") continue;
          for (const [player, list] of Object.entries(players)) {
            if (!Array.isArray(list)) continue;
            for (const e of list) {
              if (!e || typeof e !== "object" || !e.lootWon) continue;
              entries++;
              const link = String(e.lootWon);
              const parsedLink = parseItemLink(link);
              if (!parsedLink) continue;
              const id = String(e.id ?? `${e.date}-${e.time}-${player}-${parsedLink.itemId}`);
              const ts = toTs(e.date, e.time);
              const r = ins.run(
                id, player.toLowerCase(), player, parsedLink.itemId, link, JSON.stringify(parsedLink.bonusIds), e.response ?? null,
                e.responseID ?? null, e.boss ?? null, e.instance ?? null, e.difficultyID ?? null, e.mapID ?? null, e.date ?? null,
                e.time ?? null, ts, e.owner ?? null, e.class ?? null, e.votes ?? null, e.isAwardReason ? 1 : 0, now,
              );
              added += Number(r.changes);
            }
          }
        }
        this.db.conn.exec("COMMIT");
      } catch (err) {
        this.db.conn.exec("ROLLBACK");
        throw err;
      }
    }
    this.db.setMeta("history.import.at", String(now));
    this.log.info(`История RCLC: файлов ${files.length}, записей ${entries}, новых ${added}`);
    return { files: files.length, entries, added };
  }

  lootHistory(opts: { playerKey?: string; itemId?: number; limit?: number; sinceTs?: number } = {}): LootHistoryRow[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.playerKey) {
      where.push("player_key = ?");
      args.push(opts.playerKey.toLowerCase());
    }
    if (opts.itemId) {
      where.push("item_id = ?");
      args.push(opts.itemId);
    }
    if (opts.sinceTs) {
      where.push("ts >= ?");
      args.push(opts.sinceTs);
    }
    const sql = `SELECT * FROM loot_history ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ts DESC LIMIT ?`;
    args.push(opts.limit ?? 200);
    return (this.db.conn.prepare(sql).all(...(args as any[])) as any[]).map(mapHistory);
  }

  /** Полученные предметы по персонажу (для движка BiS): itemId → ts. */
  wonItemsByPlayer(): Map<string, Map<number, number>> {
    const rows = this.db.conn.prepare("SELECT player_key, item_id, MAX(ts) ts FROM loot_history GROUP BY player_key, item_id").all() as any[];
    const m = new Map<string, Map<number, number>>();
    for (const r of rows) {
      let p = m.get(r.player_key);
      if (!p) m.set(r.player_key, (p = new Map()));
      p.set(r.item_id, r.ts ?? 0);
    }
    return m;
  }

  // ------------------------------------------------------------ импорт экспорта гильдии (EasyRosterDB)

  importGuildExport(): { ranks: number; members: number; matched: number } | null {
    const files = this.savedVariableFiles(ADDON_NAME);
    let best: any = null;
    for (const f of files) {
      try {
        const parsed = parseSavedVariables(fs.readFileSync(f, "utf8")) as any;
        const g = parsed.EasyRosterDB?.guild;
        if (g && (!best || (g.exportedAt ?? 0) > (best.exportedAt ?? 0))) best = g;
      } catch (e) {
        this.log.warn(`EasyRosterDB ${f}: ${(e as Error).message}`);
      }
    }
    if (!best) return null;
    const cfg = this.config.get();
    const ranks = (best.ranks ?? {}) as Record<string, string>;
    const labels = { ...cfg.rankLabels };
    let ranksN = 0;
    for (const [idx, name] of Object.entries(ranks)) {
      if (!labels[idx]) labels[idx] = String(name);
      ranksN++;
    }
    this.config.update({ rankLabels: labels });
    const members = (best.members ?? {}) as Record<string, any>;
    let matched = 0;
    const upd = this.db.conn.prepare("UPDATE characters SET public_note = ?, officer_note = ?, rank_name = ? WHERE lower(name) = ? AND in_guild = 1");
    this.db.conn.exec("BEGIN");
    for (const m of Object.values(members)) {
      if (!m || !m.name) continue;
      const name = String(m.name).split("-")[0]!.toLowerCase();
      const r = upd.run(m.note ?? null, m.officerNote ?? null, m.rankName ?? null, name);
      matched += Number(r.changes);
    }
    this.db.conn.exec("COMMIT");
    this.log.info(`Экспорт гильдии из аддона: рангов ${ranksN}, участников ${Object.keys(members).length}, сопоставлено ${matched}`);
    return { ranks: ranksN, members: Object.keys(members).length, matched };
  }
}

export interface ExportEntry {
  r: number; // ранг в слоте
  s: "y" | "l" | "c" | "n";
  sl: string;
  sc: number;
  sp: number;
  p?: number; // % апгрейда (лучший трек)
  pt?: Record<string, number>; // % по трекам: {Hero=1.7, Myth=2.7}
  dd?: number; // абсолютный прирост dps (simc)
  dt?: number; // танк: изменение входящего урона %
  hp?: number; // танк: изменение самолечения %
  d?: string; // детали
  t?: 1; // тир
  c?: 1; // рейдовый источник для катализатора
  k?: 1; // тир-токен
}

export function parseItemLink(link: string): { itemId: number; bonusIds: number[]; context: number | null } | null {
  const m = /\|Hitem:([-\d:]*)\|h/.exec(link);
  if (!m) return null;
  const f = m[1]!.split(":");
  const itemId = Number(f[0]);
  if (!itemId) return null;
  const context = f[11] ? Number(f[11]) : null;
  const n = Number(f[12] ?? 0) || 0;
  const bonusIds: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = Number(f[13 + i]);
    if (!Number.isNaN(v) && v) bonusIds.push(v);
  }
  return { itemId, bonusIds, context: Number.isNaN(context as number) ? null : context };
}

function toTs(date: unknown, time: unknown): number | null {
  if (typeof date !== "string") return null;
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(date);
  if (!m) return null;
  const t = typeof time === "string" ? /^(\d{2}):(\d{2}):(\d{2})/.exec(time) : null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t ? Number(t[3]) : 0);
  return d.getTime();
}

function mapHistory(r: any): LootHistoryRow {
  return {
    id: r.id,
    playerKey: r.player_key,
    playerDisplay: r.player_display,
    itemId: r.item_id,
    itemLink: r.item_link,
    bonusIds: JSON.parse(r.bonus_ids ?? "[]"),
    response: r.response,
    responseId: r.response_id,
    boss: r.boss,
    instance: r.instance,
    difficultyId: r.difficulty_id,
    mapId: r.map_id,
    date: r.date,
    time: r.time,
    ts: r.ts,
    owner: r.owner,
    class: r.class,
    votes: r.votes,
  };
}

export type { ItemWanter };
