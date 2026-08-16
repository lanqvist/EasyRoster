import type { ConfigPatch, GuildProbeResult, HealthResponse, PublicConfig, RealmOption } from "@easyroster/core";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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
  probeGuild: (body: { region: string; clientId: string; clientSecret?: string; realmSlug: string; guildName: string }) =>
    request<GuildProbeResult>("/api/blizzard/probe-guild", { method: "POST", body: JSON.stringify(body) }),
};
