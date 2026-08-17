import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { decodeTrack, type CharacterDetail } from "@easyroster/core";
import type { AppContext } from "../context.js";

export async function rosterRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/characters", async (req) => {
    const q = z.object({ all: z.enum(["0", "1"]).optional() }).parse(req.query);
    return ctx.sync.repo.list({ onlyRaiders: q.all !== "1" });
  });

  app.get("/api/characters/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const character = ctx.sync.repo.get(id);
    if (!character) {
      reply.code(404);
      return { error: "Персонаж не найден" };
    }
    const eq = ctx.sync.repo.equipment(id);
    const items = ctx.staticData.items(eq.map((e) => e.itemId));
    const bonuses = ctx.staticData.getBonuses();
    const detail: CharacterDetail = {
      character,
      equipment: eq.map((e) => ({ ...e, track: decodeTrack(e.bonusIds, bonuses), icon: items.get(e.itemId)?.icon ?? null })),
    };
    return detail;
  });

  /** Ручные настройки персонажа: рейдовая спека (null = как в API), таланты (пусто = по источнику из настроек). */
  app.put("/api/characters/:id/settings", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const body = z.object({ raidSpecId: z.number().int().nullable().optional(), talentsOverride: z.string().nullable().optional(), rosterOverride: z.enum(["exclude", "include"]).nullable().optional() }).parse(req.body ?? {});
    if (!ctx.sync.repo.get(id)) {
      reply.code(404);
      return { error: "Персонаж не найден" };
    }
    ctx.sync.repo.setOverrides(id, body);
    return ctx.sync.repo.get(id);
  });

  app.get("/api/sync/status", async () => ctx.sync.status());

  /** Синк ростера гильдии (быстро, 1 запрос). */
  app.post("/api/sync/guild", async (_req, reply) => {
    try {
      return await ctx.sync.syncGuild();
    } catch (e) {
      reply.code(409);
      return { error: (e as Error).message };
    }
  });

  /**
   * Синк профилей. Запускается в фоне, ответ сразу; прогресс — /api/sync/status.
   * body: { ids?: number[], force?: boolean }
   */
  app.post("/api/sync/characters", async (req, reply) => {
    const body = z.object({ ids: z.array(z.number().int()).optional(), force: z.boolean().optional() }).parse(req.body ?? {});
    if (ctx.sync.status().running) {
      reply.code(409);
      return { error: "Синхронизация уже выполняется" };
    }
    void ctx.sync.syncCharacters(body).catch(() => undefined);
    return { started: true };
  });

  /** Полный цикл: гильдия → персонажи (фоново). */
  app.post("/api/sync/all", async (_req, reply) => {
    if (ctx.sync.status().running) {
      reply.code(409);
      return { error: "Синхронизация уже выполняется" };
    }
    void ctx.sync
      .syncGuild()
      .then(() => ctx.sync.syncCharacters())
      .catch(() => undefined);
    return { started: true };
  });
}
