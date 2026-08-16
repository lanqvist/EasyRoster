import type {
  CharacterDetail,
  CharacterRow,
  ConfigPatch,
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
  bisCharacter: (id: number, spec?: number) => request<BisCharacterView>(`/api/bis/character/${id}${spec ? `?spec=${spec}` : ""}`),
  bisTeam: () => request<BisTeamRow[]>("/api/bis/team"),
  bisItem: (itemId: number) => request<ItemWanter[]>(`/api/bis/item/${itemId}`),
  bisWanters: (itemIds: number[]) => request<Record<number, ItemWanter[]>>("/api/bis/wanters", { method: "POST", body: JSON.stringify({ itemIds }) }),
  bisManualAdd: (body: { characterId: number | null; specId: number; slot: string; itemId: number; action: "pin" | "exclude"; note?: string | null }) =>
    request<{ id: number }>("/api/bis/manual", { method: "POST", body: JSON.stringify(body) }),
  bisManualDelete: (id: number) => request<{ ok: true }>(`/api/bis/manual/${id}`, { method: "DELETE" }),
  bisManualList: (specId: number, characterId?: number) =>
    request<Array<{ id: number; characterId: number | null; specId: number; slot: string; itemId: number; action: "pin" | "exclude"; note: string | null }>>(
      `/api/bis/manual?specId=${specId}${characterId ? `&characterId=${characterId}` : ""}`,
    ),
  probeGuild: (body: { region: string; clientId: string; clientSecret?: string; realmSlug: string; guildName: string }) =>
    request<GuildProbeResult>("/api/blizzard/probe-guild", { method: "POST", body: JSON.stringify(body) }),
};
