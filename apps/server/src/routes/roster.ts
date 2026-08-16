import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CharacterDetail } from "@easyroster/core";
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
    const detail: CharacterDetail = { character, equipment: ctx.sync.repo.equipment(id) };
    return detail;
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
