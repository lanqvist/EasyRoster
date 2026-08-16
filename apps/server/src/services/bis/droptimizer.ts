import type { ParsedCandidate } from "@easyroster/core";

/**
 * Импорт отчётов Raidbots Droptimizer по ссылке (без автоматизации сабмита — только вставленные пользователем URL).
 *   https://www.raidbots.com/simbot/report/{id}  →  https://www.raidbots.com/reports/{id}/data.json
 * Структура (по публичным парсерам): sim.players[0].collected_data.dps.mean — базовый DPS,
 * sim.profilesets.results[] = { name, mean, … }, где name = "…/…/itemId/…" (части через '/').
 * Отчёты живут ограниченное время (~30 дней) → импортируем сразу.
 */

export const RAIDBOTS_BASE = process.env.EASYROSTER_RAIDBOTS_REPORTS ?? "https://www.raidbots.com";

export function extractReportId(input: string): string | null {
  const s = input.trim();
  const m = /(?:simbot\/report|reports)\/([A-Za-z0-9]+)/.exec(s);
  if (m) return m[1]!;
  if (/^[A-Za-z0-9]{10,}$/.test(s)) return s;
  return null;
}

export interface DroptimizerReport {
  reportId: string;
  character: { name: string | null; realm: string | null; region: string | null; spec: string | null };
  simType: string | null;
  date: number | null;
  baselineDps: number | null;
  fightStyle: string | null;
  results: Array<{ itemId: number; bonusIds: number[]; ilvl: number | null; slotHint: string | null; mean: number; pct: number; name: string }>;
}

const SLOT_WORDS: Record<string, string> = {
  head: "HEAD", neck: "NECK", shoulder: "SHOULDER", shoulders: "SHOULDER", back: "BACK", chest: "CHEST", wrist: "WRIST", wrists: "WRIST",
  hands: "HANDS", waist: "WAIST", legs: "LEGS", feet: "FEET", finger1: "FINGER", finger2: "FINGER", finger: "FINGER",
  trinket1: "TRINKET", trinket2: "TRINKET", trinket: "TRINKET", main_hand: "MAIN_HAND", off_hand: "OFF_HAND", mainhand: "MAIN_HAND", offhand: "OFF_HAND",
};

/** Разбор имени профильсета: ищем itemId (первый большой числовой сегмент после первых двух), bonusIds ("a:b:c"), ilvl, слот. */
export function parseProfilesetName(name: string, isKnownItem?: (id: number) => boolean): { itemId: number; bonusIds: number[]; ilvl: number | null; slotHint: string | null } | null {
  const parts = name.split("/");
  let itemId: number | null = null;
  // классический формат: [instance, encounter, itemId, ...]
  const third = Number(parts[2]);
  if (parts.length >= 3 && Number.isInteger(third) && third > 1000 && (!isKnownItem || isKnownItem(third))) itemId = third;
  if (itemId === null) {
    for (const p of parts) {
      const n = Number(p);
      if (Number.isInteger(n) && n > 10000 && (!isKnownItem || isKnownItem(n))) {
        itemId = n;
        break;
      }
    }
  }
  if (itemId === null) return null;
  let bonusIds: number[] = [];
  let ilvl: number | null = null;
  let slotHint: string | null = null;
  const itemIdx = parts.findIndex((p) => Number(p) === itemId);
  parts.forEach((p, idx) => {
    if (idx <= itemIdx) return; // до itemId — instance/encounter
    if (p.includes(":")) {
      const ids = p.split(":").map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) bonusIds = ids;
      return;
    }
    const n = Number(p);
    if (Number.isInteger(n)) {
      if (n >= 150 && n <= 600) ilvl = n;
      else if (n > 1000 && bonusIds.length === 0) bonusIds = [n];
      return;
    }
    const w = SLOT_WORDS[p.toLowerCase()];
    if (w) slotHint = w;
  });
  return { itemId, bonusIds, ilvl, slotHint };
}

export function parseDroptimizerJson(reportId: string, json: any, isKnownItem?: (id: number) => boolean): DroptimizerReport {
  const sim = json?.sim ?? {};
  const simbot = json?.simbot ?? {};
  const raw = simbot?.meta?.rawFormData ?? {};
  const player = Array.isArray(sim.players) ? sim.players[0] : null;
  const baseline: number | null = player?.collected_data?.dps?.mean ?? null;
  const results: DroptimizerReport["results"] = [];
  const list: any[] = sim?.profilesets?.results ?? [];
  for (const r of list) {
    if (!r || typeof r.name !== "string" || typeof r.mean !== "number") continue;
    const parsed = parseProfilesetName(r.name, isKnownItem);
    if (!parsed) continue;
    const pct = baseline ? ((r.mean - baseline) / baseline) * 100 : 0;
    results.push({ ...parsed, mean: r.mean, pct: Math.round(pct * 100) / 100, name: r.name });
  }
  const dateRaw = simbot?.date ?? json?.date ?? null;
  const date = typeof dateRaw === "number" ? (dateRaw < 1e12 ? dateRaw * 1000 : dateRaw) : typeof dateRaw === "string" ? Date.parse(dateRaw) || null : null;
  return {
    reportId,
    character: {
      name: raw?.character?.name ?? player?.name ?? null,
      realm: raw?.character?.realm ?? null,
      region: raw?.character?.region ?? null,
      spec: player?.specialization ?? raw?.character?.spec ?? null,
    },
    simType: simbot?.simType ?? null,
    date,
    baselineDps: baseline,
    fightStyle: raw?.fightStyle ?? sim?.options?.fight_style ?? null,
    results,
  };
}

/** Кандидаты для движка: лучший результат на предмет (по разным bonusID берём максимум), ранг по % внутри слота. */
export function droptimizerCandidates(report: DroptimizerReport, slotOf: (itemId: number) => string | null): ParsedCandidate[] {
  const best = new Map<number, DroptimizerReport["results"][number]>();
  for (const r of report.results) {
    const prev = best.get(r.itemId);
    if (!prev || r.pct > prev.pct) best.set(r.itemId, r);
  }
  const bySlot = new Map<string, Array<DroptimizerReport["results"][number]>>();
  for (const r of best.values()) {
    const slot = slotOf(r.itemId) ?? r.slotHint ?? "UNKNOWN";
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), r]);
  }
  const out: ParsedCandidate[] = [];
  for (const [slot, list] of bySlot) {
    list.sort((a, b) => b.pct - a.pct);
    list.forEach((r, i) => {
      if (r.pct <= 0) return; // не апгрейд — не кандидат
      out.push({
        list: "sim",
        slot,
        rank: i + 1,
        itemId: r.itemId,
        bonusIds: r.bonusIds,
        originalItemId: null,
        itemName: null,
        sourceNote: `Droptimizer +${r.pct.toFixed(2)}%${r.ilvl ? ` (ilvl ${r.ilvl})` : ""}`,
        score: r.pct,
      });
    });
  }
  return out;
}

export async function fetchDroptimizerReport(reportId: string, fetchImpl: typeof fetch = fetch): Promise<any> {
  const url = `${RAIDBOTS_BASE}/reports/${reportId}/data.json`;
  const res = await fetchImpl(url, { headers: { "User-Agent": "EasyRoster/0.1 (local guild tool)" }, redirect: "follow" });
  if (res.status === 403 || res.status === 404) throw new Error(`Отчёт ${reportId} недоступен (истёк срок хранения или неверная ссылка)`);
  if (!res.ok) throw new Error(`Raidbots ${res.status} для ${url}`);
  return res.json();
}
