import type { Region } from "@easyroster/core";

/**
 * Тонкий клиент Battle.net API (client-credentials).
 * - токен кэшируется до истечения;
 * - namespace передаётся заголовком Battlenet-Namespace;
 * - 429 → повтор с паузой; 304 поддерживается через If-Modified-Since.
 */
export interface BlizzardCredentials {
  clientId: string;
  clientSecret: string;
}

export class BlizzardApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = "BlizzardApiError";
  }
}

export type Namespace = "static" | "dynamic" | "profile";

interface Token {
  accessToken: string;
  expiresAt: number; // ms
}

export class BlizzardClient {
  private token: Token | null = null;

  constructor(
    private readonly creds: BlizzardCredentials,
    private readonly region: Region,
    private readonly locale: string = "ru_RU",
  ) {}

  /** Переопределяются в тестах (mock-сервер). */
  static apiBaseOverride: string | null = process.env.EASYROSTER_BLIZZARD_API ?? null;
  static oauthUrlOverride: string | null = process.env.EASYROSTER_BLIZZARD_OAUTH ?? null;

  get host(): string {
    return BlizzardClient.apiBaseOverride ?? `https://${this.region}.api.blizzard.com`;
  }

  private get oauthUrl(): string {
    return BlizzardClient.oauthUrlOverride ?? "https://oauth.battle.net/token";
  }

  async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.accessToken;
    if (!this.creds.clientId || !this.creds.clientSecret) {
      throw new BlizzardApiError(0, "oauth.battle.net/token", "Не заданы client id / secret Blizzard");
    }
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString("base64");
    const res = await fetch(this.oauthUrl, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BlizzardApiError(res.status, "oauth.battle.net/token", `OAuth ${res.status}: ${text || res.statusText}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return this.token.accessToken;
  }

  /**
   * GET с namespace. Возвращает { status, data, lastModified }.
   * При 304 data = null.
   */
  async get<T>(
    path: string,
    ns: Namespace,
    opts: { query?: Record<string, string>; ifModifiedSince?: string; retries?: number } = {},
  ): Promise<{ status: number; data: T | null; lastModified?: string }> {
    const token = await this.getToken();
    const url = new URL(path, this.host);
    url.searchParams.set("locale", this.locale);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Battlenet-Namespace": `${ns}-${this.region}`,
      Accept: "application/json",
    };
    if (opts.ifModifiedSince) headers["If-Modified-Since"] = opts.ifModifiedSince;

    const retries = opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers });
      if (res.status === 429 && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.status === 304) return { status: 304, data: null, lastModified: opts.ifModifiedSince };
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new BlizzardApiError(res.status, url.toString(), `Blizzard API ${res.status} ${url.pathname}: ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as T;
      return { status: res.status, data, lastModified: res.headers.get("last-modified") ?? undefined };
    }
  }

  // ---- удобные обёртки -------------------------------------------------

  async realmIndex(): Promise<Array<{ id: number; name: string; slug: string }>> {
    const r = await this.get<{ realms: Array<{ id: number; name: string; slug: string }> }>("/data/wow/realm/index", "dynamic");
    return r.data!.realms;
  }

  async guild(realmSlug: string, nameSlug: string) {
    const r = await this.get<GuildSummary>(`/data/wow/guild/${enc(realmSlug)}/${enc(nameSlug)}`, "profile");
    return r.data!;
  }

  async guildRoster(realmSlug: string, nameSlug: string) {
    const r = await this.get<GuildRoster>(`/data/wow/guild/${enc(realmSlug)}/${enc(nameSlug)}/roster`, "profile");
    return r.data!;
  }

  private charPath(realmSlug: string, name: string, suffix = ""): string {
    return `/profile/wow/character/${enc(realmSlug)}/${enc(name.toLowerCase())}${suffix}`;
  }

  /** {id, is_valid}; 404 → null (профиля нет). */
  async characterStatus(realmSlug: string, name: string): Promise<CharacterStatus | null> {
    try {
      const r = await this.get<CharacterStatus>(this.charPath(realmSlug, name, "/status"), "profile");
      return r.data;
    } catch (e) {
      if (e instanceof BlizzardApiError && (e.status === 404 || e.status === 403)) return null;
      throw e;
    }
  }

  async characterSummary(realmSlug: string, name: string, ifModifiedSince?: string) {
    return this.get<CharacterSummary>(this.charPath(realmSlug, name), "profile", { ifModifiedSince });
  }

  async characterEquipment(realmSlug: string, name: string) {
    const r = await this.get<CharacterEquipment>(this.charPath(realmSlug, name, "/equipment"), "profile");
    return r.data!;
  }

  async characterSpecializations(realmSlug: string, name: string) {
    const r = await this.get<CharacterSpecializations>(this.charPath(realmSlug, name, "/specializations"), "profile");
    return r.data!;
  }

  async characterMedia(realmSlug: string, name: string) {
    const r = await this.get<CharacterMedia>(this.charPath(realmSlug, name, "/character-media"), "profile");
    return r.data!;
  }
}

export interface CharacterStatus {
  id: number;
  is_valid: boolean;
}

export interface CharacterSummary {
  id: number;
  name: string;
  level: number;
  faction: { type: string; name: string };
  character_class: { id: number; name: string };
  active_spec?: { id: number; name: string };
  realm: { id: number; slug: string; name: string };
  guild?: { id: number; name: string; realm: { slug: string } };
  average_item_level: number;
  equipped_item_level: number;
  last_login_timestamp: number;
}

export interface EquippedItem {
  item: { id: number };
  slot: { type: string; name: string };
  quality: { type: string; name: string };
  name: string;
  level?: { value: number };
  inventory_type?: { type: string; name: string };
  bonus_list?: number[];
  context?: number;
  name_description?: { display_string: string };
  enchantments?: Array<{ enchantment_id?: number; enchantment_slot?: { id: number; type: string } }>;
  sockets?: Array<{ socket_type: { type: string }; item?: { id: number; name: string } }>;
  set?: { item_set: { id: number; name: string } };
}

export interface CharacterEquipment {
  equipped_items: EquippedItem[];
}

export interface CharacterSpecializations {
  active_specialization?: { id: number; name: string };
  specializations?: Array<{
    specialization: { id: number; name: string };
    loadouts?: Array<{ is_active: boolean; talent_loadout_code: string }>;
  }>;
}

export interface CharacterMedia {
  assets?: Array<{ key: string; value: string }>;
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Слуг гильдии/реалма по правилам Blizzard: нижний регистр, пробелы → "-", апострофы убираются. */
export function toBlizzardSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, "-");
}

// ---- типы ответов ------------------------------------------------------

export interface GuildSummary {
  id: number;
  name: string;
  faction: { type: string; name: string };
  member_count: number;
  realm: { name: string; slug: string; id: number };
}

export interface GuildRosterMember {
  character: {
    name: string;
    id: number;
    realm: { slug: string; id: number; name?: string };
    level: number;
    playable_class: { id: number };
    playable_race: { id: number };
    faction: { type: string };
  };
  rank: number;
}

export interface GuildRoster {
  guild: { name: string; id: number; realm: { name: string; slug: string } };
  members: GuildRosterMember[];
}
