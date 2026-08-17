import type {
  CharacterDetail,
  CharacterRow,
  ConfigPatch,
  AddonStatus,
  LootHistoryRow,
  BisCharacterView,
  BisSourceStatus,
  BisTeamRow,
  ItemWanter,
  InstanceRow,
  LootInstanceView,
  StaticDataStatus,
  GuildProbeResult,
  HealthResponse,
  PublicConfig,
  RealmOption,
  SyncStatus,
  SimStatus,
  TierRow,
  TierTokenView,
} from "@easyroster/core";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  getConfig: () => request<PublicConfig>("/api/config"),
  updateConfig: (patch: ConfigPatch) => request<PublicConfig>("/api/config", { method: "PUT", body: JSON.stringify(patch) }),
  realms: (body: { region: string; clientId?: string; clientSecret?: string }) =>
    request<RealmOption[]>("/api/blizzard/realms", { method: "POST", body: JSON.stringify(body) }),
  characters: (all = false) => request<CharacterRow[]>(`/api/characters${all ? "?all=1" : ""}`),
  character: (id: number) => request<CharacterDetail>(`/api/characters/${id}`),
  syncStatus: () => request<SyncStatus>("/api/sync/status"),
  syncGuild: () => request<unknown>("/api/sync/guild", { method: "POST" }),
  syncCharacters: (body: { ids?: number[]; force?: boolean } = {}) =>
    request<{ started: true }>("/api/sync/characters", { method: "POST", body: JSON.stringify(body) }),
  syncAll: () => request<{ started: true }>("/api/sync/all", { method: "POST" }),
  staticStatus: () => request<StaticDataStatus>("/api/static/status"),
  staticRefresh: (force = false) => request<unknown>("/api/static/refresh", { method: "POST", body: JSON.stringify({ force }) }),
  lootInstances: () => request<{ season: StaticDataStatus["season"]; all: InstanceRow[] }>("/api/loot/instances"),
  lootInstance: (id: number) => request<LootInstanceView>(`/api/loot/instances/${id}`),
  bisStatus: () => request<{ sources: BisSourceStatus[]; progress: { source: string; done: number; total: number; current: string } | null }>("/api/bis/status"),
  bisRefresh: (source: "icyveins" | "wcl", body: { specIds?: number[]; all?: boolean } = {}) =>
    request<{ started: true }>(`/api/bis/sources/${source}/refresh`, { method: "POST", body: JSON.stringify(body) }),
  bisCharacter: (id: number, spec?: number, difficulty?: string) =>
    request<BisCharacterView>(`/api/bis/character/${id}?${spec ? `spec=${spec}&` : ""}${difficulty ? `difficulty=${difficulty}` : ""}`),
  bisTeam: () => request<BisTeamRow[]>("/api/bis/team"),
  bisItem: (itemId: number, difficulty?: string) => request<ItemWanter[]>(`/api/bis/item/${itemId}${difficulty ? `?difficulty=${difficulty}` : ""}`),
  bisWanters: (itemIds: number[], difficulty?: string) => request<Record<number, ItemWanter[]>>("/api/bis/wanters", { method: "POST", body: JSON.stringify({ itemIds, difficulty }) }),
  bisManualAdd: (body: { characterId: number | null; specId: number; slot: string; itemId: number; action: "pin" | "exclude"; note?: string | null }) =>
    request<{ id: number }>("/api/bis/manual", { method: "POST", body: JSON.stringify(body) }),
  bisManualDelete: (id: number) => request<{ ok: true }>(`/api/bis/manual/${id}`, { method: "DELETE" }),
  bisManualList: (specId: number, characterId?: number) =>
    request<Array<{ id: number; characterId: number | null; specId: number; slot: string; itemId: number; action: "pin" | "exclude"; note: string | null }>>(
      `/api/bis/manual?specId=${specId}${characterId ? `&characterId=${characterId}` : ""}`,
    ),
  wowStatus: () => request<AddonStatus>("/api/wow/status"),
  wowInstallAddon: () => request<{ dir: string; files: number }>("/api/wow/addon/install", { method: "POST" }),
  wowExport: () => request<{ path: string; characters: number; bytes: number }>("/api/wow/export", { method: "POST" }),
  wowImportHistory: () => request<{ files: number; entries: number; added: number }>("/api/wow/import/history", { method: "POST" }),
  wowImportGuild: () => request<{ ranks: number; members: number; matched: number }>("/api/wow/import/guild", { method: "POST" }),
  wowHistory: (q: { player?: string; itemId?: number; limit?: number; sinceTs?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.player) p.set("player", q.player);
    if (q.itemId) p.set("itemId", String(q.itemId));
    if (q.limit) p.set("limit", String(q.limit));
    if (q.sinceTs) p.set("sinceTs", String(q.sinceTs));
    return request<LootHistoryRow[]>(`/api/wow/history?${p}`);
  },
  bisDroptimizer: (characterId: number, url: string) =>
    request<{ reportId: string; results: number; candidates: number; warning: string | null }>("/api/bis/droptimizer", { method: "POST", body: JSON.stringify({ characterId, url }) }),
  bisSim: (characterId: number) =>
    request<{ id: number; kind: string; url: string | null; simDate: number | null; importedAt: number; baselineDps: number | null; fightStyle: string | null } | null>(`/api/bis/sim/${characterId}`),
  tier: () => request<{ rows: TierRow[]; tokens: TierTokenView[] }>("/api/tier"),
  simStatus: () => request<SimStatus>("/api/sim/status"),
  simInstall: () => request<{ started: true }>("/api/sim/install", { method: "POST" }),
  simRun: (body: { ids?: number[]; all?: boolean; onlyStale?: boolean }) => request<{ queued: number }>("/api/sim/run", { method: "POST", body: JSON.stringify(body) }),
  simClear: () => request<{ ok: true }>("/api/sim/clear", { method: "POST" }),
  simCharacter: (id: number) => request<{ report: any; results: Array<any> }>(`/api/sim/character/${id}`),
  probeGuild: (body: { region: string; clientId: string; clientSecret?: string; realmSlug: string; guildName: string }) =>
    request<GuildProbeResult>("/api/blizzard/probe-guild", { method: "POST", body: JSON.stringify(body) }),
};
