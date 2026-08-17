import type { BisCandidateRow, BisSource, ParsedCandidate } from "@easyroster/core";
import type { Db } from "../db.js";

export interface ManualRule {
  id: number;
  characterId: number | null;
  specId: number;
  slot: string;
  itemId: number;
  action: "pin" | "exclude";
  note: string | null;
  createdAt: number;
}

export class BisRepo {
  constructor(private readonly db: Db) {}

  /** Заменить кандидатов источника для спеки (и персонажа, если персональные). */
  replaceCandidates(source: BisSource, specId: number, characterId: number | null, list: ParsedCandidate[], fetchedAt: number): void {
    const c = this.db.conn;
    c.exec("BEGIN");
    try {
      c.prepare("DELETE FROM bis_candidates WHERE source = ? AND spec_id = ? AND character_id IS ?").run(source, specId, characterId);
      const ins = c.prepare(`
        INSERT INTO bis_candidates(source, spec_id, character_id, list, slot, rank, item_id, bonus_ids, original_item_id, item_name, source_note, score, fetched_at, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of list) {
        ins.run(source, specId, characterId, p.list, p.slot, p.rank, p.itemId, JSON.stringify(p.bonusIds), p.originalItemId, p.itemName, p.sourceNote, p.score, fetchedAt, p.meta ? JSON.stringify(p.meta) : null);
      }
      c.exec("COMMIT");
    } catch (e) {
      c.exec("ROLLBACK");
      throw e;
    }
  }

  allCandidateItemIds(): number[] {
    return (this.db.conn.prepare("SELECT DISTINCT item_id FROM bis_candidates").all() as Array<{ item_id: number }>).map((r) => r.item_id);
  }

  candidatesForSpec(specId: number, characterId: number | null): BisCandidateRow[] {
    const rows = this.db.conn
      .prepare("SELECT * FROM bis_candidates WHERE spec_id = ? AND (character_id IS NULL OR character_id = ?) ORDER BY source, list, slot, rank")
      .all(specId, characterId) as any[];
    return rows.map(mapCandidate);
  }

  /** Все кандидаты по предмету (для «кому нужен»). */
  candidatesForItem(itemId: number): BisCandidateRow[] {
    return (this.db.conn.prepare("SELECT * FROM bis_candidates WHERE item_id = ? OR original_item_id = ?").all(itemId, itemId) as any[]).map(mapCandidate);
  }

  sourceStats(): Array<{ source: BisSource; specs: number; candidates: number; lastFetched: number | null }> {
    return (
      this.db.conn
        .prepare("SELECT source, COUNT(DISTINCT CASE WHEN character_id IS NULL THEN spec_id ELSE character_id END) specs, COUNT(*) candidates, MAX(fetched_at) last FROM bis_candidates GROUP BY source")
        .all() as any[]
    ).map((r) => ({ source: r.source, specs: r.specs, candidates: r.candidates, lastFetched: r.last }));
  }

  lastRun(source: BisSource): { at: number; ok: boolean; message: string } | null {
    const r = this.db.conn
      .prepare("SELECT finished_at, ok, message FROM bis_source_runs WHERE source = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1")
      .get(source) as any;
    return r ? { at: r.finished_at, ok: !!r.ok, message: r.message ?? "" } : null;
  }

  runStart(source: BisSource, specId: number | null): number {
    return Number(this.db.conn.prepare("INSERT INTO bis_source_runs(source, spec_id, started_at) VALUES (?, ?, ?)").run(source, specId, Date.now()).lastInsertRowid);
  }
  runFinish(id: number, ok: boolean, message: string): void {
    this.db.conn.prepare("UPDATE bis_source_runs SET finished_at = ?, ok = ?, message = ? WHERE id = ?").run(Date.now(), ok ? 1 : 0, message, id);
  }

  fetchedAt(source: BisSource, specId: number): number | null {
    const r = this.db.conn.prepare("SELECT MAX(fetched_at) t FROM bis_candidates WHERE source = ? AND spec_id = ? AND character_id IS NULL").get(source, specId) as any;
    return r?.t ?? null;
  }

  // ---- ручные правки
  manualRules(specId: number, characterId: number | null): ManualRule[] {
    return (
      this.db.conn
        .prepare("SELECT * FROM bis_manual WHERE spec_id = ? AND (character_id IS NULL OR character_id = ?) ORDER BY id")
        .all(specId, characterId) as any[]
    ).map((r) => ({ id: r.id, characterId: r.character_id, specId: r.spec_id, slot: r.slot, itemId: r.item_id, action: r.action, note: r.note, createdAt: r.created_at }));
  }
  addManual(rule: Omit<ManualRule, "id" | "createdAt">): number {
    return Number(
      this.db.conn
        .prepare("INSERT INTO bis_manual(character_id, spec_id, slot, item_id, action, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(rule.characterId, rule.specId, rule.slot, rule.itemId, rule.action, rule.note, Date.now()).lastInsertRowid,
    );
  }
  deleteManual(id: number): void {
    this.db.conn.prepare("DELETE FROM bis_manual WHERE id = ?").run(id);
  }

  // ---- симы
  addSimReport(r: {
    characterId: number; specId: number | null; kind: string; reportId: string | null; url: string | null; simDate: number | null;
    baselineDps: number | null; fightStyle: string | null; meta: unknown;
  }): number {
    return Number(
      this.db.conn
        .prepare("INSERT INTO sim_reports(character_id, spec_id, kind, report_id, url, sim_date, imported_at, baseline_dps, fight_style, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(r.characterId, r.specId, r.kind, r.reportId, r.url, r.simDate, Date.now(), r.baselineDps, r.fightStyle, JSON.stringify(r.meta ?? null)).lastInsertRowid,
    );
  }
  latestSim(characterId: number): { id: number; specId: number | null; kind: string; url: string | null; simDate: number | null; importedAt: number; baselineDps: number | null; fightStyle: string | null } | null {
    const r = this.db.conn.prepare("SELECT * FROM sim_reports WHERE character_id = ? ORDER BY imported_at DESC LIMIT 1").get(characterId) as any;
    return r ? { id: r.id, specId: r.spec_id, kind: r.kind, url: r.url, simDate: r.sim_date, importedAt: r.imported_at, baselineDps: r.baseline_dps, fightStyle: r.fight_style } : null;
  }
}

function mapCandidate(r: any): BisCandidateRow {
  return {
    id: r.id,
    source: r.source,
    specId: r.spec_id,
    characterId: r.character_id,
    list: r.list,
    slot: r.slot,
    rank: r.rank,
    itemId: r.item_id,
    bonusIds: JSON.parse(r.bonus_ids ?? "[]"),
    originalItemId: r.original_item_id,
    itemName: r.item_name,
    sourceNote: r.source_note,
    score: r.score,
    fetchedAt: r.fetched_at,
    meta: r.meta ? JSON.parse(r.meta) : null,
  };
}
