import type { FastifyInstance } from "fastify";
import { toPublicConfig, type GuildProbeResult, type RealmOption } from "@easyroster/core";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { BlizzardApiError, BlizzardClient, toBlizzardSlug } from "../services/blizzard.js";

const ProbeBody = z.object({
  region: z.enum(["eu", "us", "kr", "tw"]),
  clientId: z.string().min(1),
  /** пусто → берём сохранённый секрет */
  clientSecret: z.string().optional(),
  realmSlug: z.string().min(1),
  guildName: z.string().min(1),
});

export async function configRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/config", async () => toPublicConfig(ctx.config.get()));

  app.put("/api/config", async (req, reply) => {
    try {
      const before = ctx.config.get();
      const cfg = ctx.config.update(req.body);
      if (JSON.stringify(before.raiderRanks) !== JSON.stringify(cfg.raiderRanks)) {
        ctx.sync.repo.recomputeRaiders(cfg.raiderRanks);
      }
      if (before.sync.intervalMinutes !== cfg.sync.intervalMinutes) ctx.sync.startScheduler();
      return toPublicConfig(cfg);
    } catch (e) {
      reply.code(400);
      return { error: "Некорректный конфиг", details: (e as Error).message };
    }
  });

  /**
   * Список реалмов региона (для выпадающего списка в мастере).
   * Ключи можно передать в теле — тогда это одновременно проверка ключей без сохранения.
   */
  app.post("/api/blizzard/realms", async (req, reply) => {
    const q = z
      .object({
        region: z.enum(["eu", "us", "kr", "tw"]).optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
      })
      .parse(req.body ?? {});
    const cfg = ctx.config.get();
    const creds = {
      clientId: q.clientId || cfg.blizzard.clientId,
      clientSecret: q.clientSecret || cfg.blizzard.clientSecret,
    };
    const client = new BlizzardClient(creds, q.region ?? cfg.region, cfg.locale);
    try {
      const realms = await client.realmIndex();
      const out: RealmOption[] = realms
        .map((r) => ({ id: r.id, name: (typeof r.name === "string" && r.name) || r.slug, slug: r.slug }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
      return out;
    } catch (e) {
      return sendApiError(reply, e);
    }
  });

  /** Проверка ключей + гильдии: сводка и распределение по индексам рангов. */
  app.post("/api/blizzard/probe-guild", async (req, reply) => {
    const body = ProbeBody.parse(req.body);
    const cfg = ctx.config.get();
    const creds = {
      clientId: body.clientId,
      clientSecret: body.clientSecret && body.clientSecret.length > 0 ? body.clientSecret : cfg.blizzard.clientSecret,
    };
    const client = new BlizzardClient(creds, body.region, cfg.locale);
    const nameSlug = toBlizzardSlug(body.guildName);
    try {
      const [summary, roster] = await Promise.all([
        client.guild(body.realmSlug, nameSlug),
        client.guildRoster(body.realmSlug, nameSlug),
      ]);
      const byRank = new Map<number, { total: number; maxLevel: number }>();
      const maxLevel = Math.max(...roster.members.map((m) => m.character.level));
      for (const m of roster.members) {
        const r = byRank.get(m.rank) ?? { total: 0, maxLevel: 0 };
        r.total += 1;
        if (m.character.level >= maxLevel) r.maxLevel += 1;
        byRank.set(m.rank, r);
      }
      const result: GuildProbeResult = {
        guild: {
          name: summary.name,
          nameSlug,
          realmSlug: summary.realm.slug,
          realmName: summary.realm.name,
          memberCount: summary.member_count,
          faction: summary.faction.name,
        },
        ranks: [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([rank, v]) => ({ rank, ...v })),
      };
      return result;
    } catch (e) {
      return sendApiError(reply, e);
    }
  });
}

function sendApiError(reply: { code: (n: number) => unknown }, e: unknown) {
  if (e instanceof BlizzardApiError) {
    reply.code(e.status === 401 || e.status === 403 ? 401 : e.status === 404 ? 404 : 502);
    return { error: e.message };
  }
  reply.code(500);
  return { error: (e as Error).message };
}
