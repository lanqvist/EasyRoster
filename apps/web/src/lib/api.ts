import type {
  CharacterDetail,
  CharacterRow,
  ConfigPatch,
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
  probeGuild: (body: { region: string; clientId: string; clientSecret?: string; realmSlug: string; guildName: string }) =>
    request<GuildProbeResult>("/api/blizzard/probe-guild", { method: "POST", body: JSON.stringify(body) }),
};
