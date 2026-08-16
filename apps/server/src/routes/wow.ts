import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";

export async function wowRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/wow/status", async () => ctx.wow.status());

  app.post("/api/wow/addon/install", async (_req, reply) => {
    try {
      return ctx.wow.installAddon();
    } catch (e) {
      reply.code(400);
      return { error: (e as Error).message };
    }
  });

  /** Сгенерировать и записать Data\db.lua в папку аддона. */
  app.post("/api/wow/export", async (_req, reply) => {
    try {
      return ctx.wow.exportDbLua();
    } catch (e) {
      reply.code(400);
      return { error: (e as Error).message };
    }
  });

  /** Предпросмотр db.lua (текст). */
  app.get("/api/wow/export/preview", async (_req, reply) => {
    const { lua } = ctx.wow.renderDbLua();
    reply.type("text/plain; charset=utf-8");
    return lua;
  });

  /** Импорт истории лута из SavedVariables RCLootCouncil (все аккаунты). */
  app.post("/api/wow/import/history", async (_req, reply) => {
    try {
      const r = ctx.wow.importLootHistory();
      ctx.bis.invalidateHistoryCache();
      return r;
    } catch (e) {
      reply.code(400);
      return { error: (e as Error).message };
    }
  });

  /** Импорт экспорта гильдии (ранги/заметки) из SavedVariables аддона EasyRoster. */
  app.post("/api/wow/import/guild", async (_req, reply) => {
    try {
      const r = ctx.wow.importGuildExport();
      if (!r) {
        reply.code(404);
        return { error: "SavedVariables RCLootCouncil_EasyRoster не найдены — зайдите в игру с аддоном и сделайте /reload" };
      }
      return r;
    } catch (e) {
      reply.code(400);
      return { error: (e as Error).message };
    }
  });

  app.get("/api/wow/history", async (req) => {
    const q = z
      .object({ player: z.string().optional(), itemId: z.coerce.number().int().optional(), limit: z.coerce.number().int().max(2000).optional(), sinceTs: z.coerce.number().optional() })
      .parse(req.query);
    return ctx.wow.lootHistory({ playerKey: q.player, itemId: q.itemId, limit: q.limit, sinceTs: q.sinceTs });
  });
}
