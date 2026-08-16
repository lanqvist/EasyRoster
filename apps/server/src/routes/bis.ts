import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";

export async function bisRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/bis/status", async () => ctx.bis.status());

  const RefreshBody = z.object({ specIds: z.array(z.number().int()).optional(), all: z.boolean().optional() });

  app.post("/api/bis/sources/icyveins/refresh", async (req, reply) => {
    const body = RefreshBody.parse(req.body ?? {});
    if (ctx.bis.status().sources.find((s) => s.source === "icyveins")?.running) {
      reply.code(409);
      return { error: "Уже идёт" };
    }
    void ctx.bis.refreshIcyVeins(body.all ? undefined : body.specIds).catch(() => undefined);
    return { started: true };
  });

  app.post("/api/bis/sources/wcl/refresh", async (req, reply) => {
    const body = RefreshBody.parse(req.body ?? {});
    if (ctx.bis.status().sources.find((s) => s.source === "wcl")?.running) {
      reply.code(409);
      return { error: "Уже идёт" };
    }
    const cfg = ctx.config.get();
    if (!cfg.warcraftLogs.clientId || !cfg.warcraftLogs.clientSecret) {
      reply.code(400);
      return { error: "Не заданы ключи Warcraft Logs — Настройки → Ключи API (warcraftlogs.com/api/clients)" };
    }
    void ctx.bis.refreshWcl(body.all ? undefined : body.specIds).catch(() => undefined);
    return { started: true };
  });

  app.get("/api/bis/character/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const q = z.object({ spec: z.coerce.number().int().optional() }).parse(req.query);
    const c = ctx.sync.repo.get(id);
    if (!c) {
      reply.code(404);
      return { error: "Персонаж не найден" };
    }
    const view = ctx.bis.characterBis(c, q.spec);
    if (!view) {
      reply.code(409);
      return { error: "У персонажа не определена спека — синхронизируйте профиль" };
    }
    return view;
  });

  app.get("/api/bis/team", async () => ctx.bis.team());

  /** Импорт отчёта Raidbots Droptimizer по ссылке. */
  app.post("/api/bis/droptimizer", async (req, reply) => {
    const body = z.object({ characterId: z.number().int(), url: z.string().min(5) }).parse(req.body);
    const c = ctx.sync.repo.get(body.characterId);
    if (!c) {
      reply.code(404);
      return { error: "Персонаж не найден" };
    }
    try {
      return await ctx.bis.importDroptimizer(c, body.url);
    } catch (e) {
      reply.code(400);
      return { error: (e as Error).message };
    }
  });

  app.get("/api/bis/sim/:characterId", async (req) => {
    const { characterId } = z.object({ characterId: z.coerce.number().int() }).parse(req.params);
    return ctx.bis.repo.latestSim(characterId);
  });

  app.get("/api/bis/item/:itemId", async (req) => {
    const { itemId } = z.object({ itemId: z.coerce.number().int() }).parse(req.params);
    return ctx.bis.wanters(itemId);
  });

  app.post("/api/bis/wanters", async (req) => {
    const body = z.object({ itemIds: z.array(z.number().int()).max(500) }).parse(req.body);
    return ctx.bis.wantersForItems(body.itemIds);
  });

  app.get("/api/bis/manual", async (req) => {
    const q = z.object({ specId: z.coerce.number().int(), characterId: z.coerce.number().int().optional() }).parse(req.query);
    return ctx.bis.repo.manualRules(q.specId, q.characterId ?? null);
  });

  app.post("/api/bis/manual", async (req) => {
    const body = z
      .object({
        characterId: z.number().int().nullable(),
        specId: z.number().int(),
        slot: z.string().min(1),
        itemId: z.number().int(),
        action: z.enum(["pin", "exclude"]),
        note: z.string().nullable().optional(),
      })
      .parse(req.body);
    const id = ctx.bis.repo.addManual({ ...body, note: body.note ?? null });
    return { id };
  });

  app.delete("/api/bis/manual/:id", async (req) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    ctx.bis.repo.deleteManual(id);
    return { ok: true };
  });
}
