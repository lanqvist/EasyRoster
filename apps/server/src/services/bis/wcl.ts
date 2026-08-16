import { CLASS_IDS, SPEC_BY_ID, type ClassId, type ParsedCandidate } from "@easyroster/core";

/**
 * Warcraft Logs API v2 (GraphQL, client-credentials).
 * Берём characterRankings(includeCombatantInfo: true) по спеке × боссу → экипировка топ-игроков →
 * популярность предметов по слотам. Лимит: 3600 очков/час на клиента.
 */
export interface WclCredentials {
  clientId: string;
  clientSecret: string;
}

export const WCL_TOKEN_URL = process.env.EASYROSTER_WCL_OAUTH ?? "https://www.warcraftlogs.com/oauth/token";
export const WCL_API_URL = process.env.EASYROSTER_WCL_API ?? "https://www.warcraftlogs.com/api/v2/client";

/** WCL className / specName (PascalCase без пробелов). */
export function wclClassName(classId: number): string {
  const file = CLASS_IDS[classId as ClassId];
  const map: Record<string, string> = {
    WARRIOR: "Warrior", PALADIN: "Paladin", HUNTER: "Hunter", ROGUE: "Rogue", PRIEST: "Priest", DEATHKNIGHT: "DeathKnight",
    SHAMAN: "Shaman", MAGE: "Mage", WARLOCK: "Warlock", MONK: "Monk", DRUID: "Druid", DEMONHUNTER: "DemonHunter", EVOKER: "Evoker",
  };
  return map[file] ?? file;
}
export function wclSpecName(specId: number): string {
  const s = SPEC_BY_ID.get(specId);
  return s ? s.name.replace(/\s+/g, "") : String(specId);
}

/** Индекс в массиве gear → канонический слот. */
export const WCL_GEAR_SLOTS: Array<string | null> = [
  "HEAD", "NECK", "SHOULDER", null /*shirt*/, "CHEST", "WAIST", "LEGS", "FEET", "WRIST", "HANDS",
  "FINGER", "FINGER", "TRINKET", "TRINKET", "BACK", "MAIN_HAND", "OFF_HAND", null /*tabard*/,
];

export interface WclGearItem {
  id: number;
  name?: string;
  itemLevel?: number;
  bonusIDs?: number[];
  setID?: number;
}
export interface WclRanking {
  name?: string;
  amount?: number;
  gear?: WclGearItem[];
}

export class WclClient {
  private token: { value: string; expiresAt: number } | null = null;
  pointsSpent = 0;

  constructor(private readonly creds: WclCredentials) {}

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.value;
    if (!this.creds.clientId || !this.creds.clientSecret) throw new Error("Не заданы client id / secret Warcraft Logs");
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString("base64");
    const res = await fetch(WCL_TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`WCL OAuth ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return this.token.value;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = await this.getToken();
    const res = await fetch(WCL_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`WCL API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    const j = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (j.errors?.length) throw new Error(`WCL GraphQL: ${j.errors.map((e) => e.message).join("; ")}`);
    return j.data as T;
  }

  async rateLimit(): Promise<{ limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number }> {
    const d = await this.query<{ rateLimitData: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number } }>(
      "{ rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } }",
    );
    return d.rateLimitData;
  }

  /** Зоны с энкаунтерами (для сопоставления с журналом Blizzard). */
  async zones(): Promise<Array<{ id: number; name: string; expansion?: { id: number; name: string }; encounters: Array<{ id: number; name: string }> }>> {
    const d = await this.query<{ worldData: { zones: Array<{ id: number; name: string; expansion?: { id: number; name: string }; encounters: Array<{ id: number; name: string }> }> } }>(
      "{ worldData { zones { id name expansion { id name } encounters { id name } } } }",
    );
    return d.worldData.zones;
  }

  /**
   * Рейтинг персонажей по энкаунтеру со снаряжением.
   * difficulty: 3 normal, 4 heroic, 5 mythic. metric: dps | hps.
   */
  async characterRankings(opts: {
    encounterId: number;
    className: string;
    specName: string;
    difficulty: number;
    metric: "dps" | "hps";
    page: number;
  }): Promise<{ rankings: WclRanking[]; hasMorePages: boolean; count: number }> {
    const d = await this.query<{ worldData: { encounter: { characterRankings: any } } }>(
      `query($enc:Int!, $class:String!, $spec:String!, $diff:Int!, $metric:CharacterRankingMetricType!, $page:Int!) {
        worldData { encounter(id:$enc) {
          characterRankings(className:$class, specName:$spec, difficulty:$diff, metric:$metric, page:$page, includeCombatantInfo:true)
        } }
      }`,
      { enc: opts.encounterId, class: opts.className, spec: opts.specName, diff: opts.difficulty, metric: opts.metric, page: opts.page },
    );
    const cr = d.worldData?.encounter?.characterRankings ?? {};
    return { rankings: (cr.rankings ?? []) as WclRanking[], hasMorePages: !!cr.hasMorePages, count: Number(cr.count ?? 0) };
  }
}

/**
 * Агрегация: список рейтингов → кандидаты по слотам с популярностью (%).
 * Кольца/тринкеты/оружие объединяются в один слот; предметы с id 0 пропускаются.
 */
export function aggregateGear(rankings: WclRanking[], minSharePct = 5): ParsedCandidate[] {
  const perSlot = new Map<string, Map<number, { count: number; bonus: Map<string, number>; name: string | null }>>();
  let parses = 0;
  for (const r of rankings) {
    if (!r.gear || r.gear.length === 0) continue;
    parses++;
    r.gear.forEach((g, i) => {
      const slot = WCL_GEAR_SLOTS[i];
      if (!slot || !g || !g.id) return;
      let m = perSlot.get(slot);
      if (!m) perSlot.set(slot, (m = new Map()));
      let e = m.get(g.id);
      if (!e) m.set(g.id, (e = { count: 0, bonus: new Map(), name: g.name ?? null }));
      e.count++;
      const key = (g.bonusIDs ?? []).join(":");
      e.bonus.set(key, (e.bonus.get(key) ?? 0) + 1);
    });
  }
  const out: ParsedCandidate[] = [];
  if (parses === 0) return out;
  for (const [slot, m] of perSlot) {
    // для парных слотов делим на 2 (два предмета на игрока)
    const denom = slot === "FINGER" || slot === "TRINKET" ? parses * 2 : parses;
    const sorted = [...m.entries()].sort((a, b) => b[1].count - a[1].count);
    let rank = 0;
    for (const [itemId, e] of sorted) {
      const pct = (e.count / denom) * 100;
      if (pct < minSharePct) break;
      rank++;
      const topBonus = [...e.bonus.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      out.push({
        list: "overall",
        slot,
        rank,
        itemId,
        bonusIds: topBonus ? topBonus.split(":").map(Number).filter((n) => !Number.isNaN(n)) : [],
        originalItemId: null,
        itemName: e.name,
        sourceNote: `${pct.toFixed(0)}% из ${parses} парсов`,
        score: Math.round(pct * 10) / 10,
      });
    }
  }
  return out;
}
