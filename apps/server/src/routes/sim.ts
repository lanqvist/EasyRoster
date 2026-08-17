import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context.js";

export async function simRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/sim/status", async () => ctx.sim.status());

  /** Скачать/обновить SimulationCraft (nightly). Фоново. */
  app.post("/api/sim/install", async (_req, reply) => {
    if (ctx.sim.runner.installing) {
      reply.code(409);
      return { error: "Установка уже идёт" };
    }
    void ctx.sim.runner.install().catch((e) => ctx.log.warn(`simc install: ${(e as Error).message}`));
    return { started: true };
  });

  /** Поставить в очередь: {ids?: number[], all?: boolean, onlyStale?: boolean} */
  app.post("/api/sim/run", async (req, reply) => {
    const body = z.object({ ids: z.array(z.number().int()).optional(), all: z.boolean().optional(), onlyStale: z.boolean().optional() }).parse(req.body ?? {});
    const st = ctx.sim.status();
    if (!st.simcPath) {
      reply.code(400);
      return { error: "SimulationCraft не установлен — Настройки → Автосим → «Установить SimC»" };
    }
    const added = ctx.sim.enqueue(body.all ? "all" : body.ids ?? [], body.onlyStale ?? false);
    return { queued: added };
  });

  app.post("/api/sim/clear", async () => {
    ctx.sim.clearQueue();
    return { ok: true };
  });

  /** Тир-сет: прогресс, ценность 2pc/4pc, приоритет; токены — кому. */
  app.get("/api/tier", async () => {
    const rows = ctx.tier.rows();
    return { rows, tokens: ctx.tier.tokenViews(rows) };
  });

  /** Последний результат сима персонажа: кандидаты simc с метаданными. */
  app.get("/api/sim/character/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const c = ctx.sync.repo.get(id);
    if (!c) {
      reply.code(404);
      return { error: "Персонаж не найден" };
    }
    const cands = ctx.bis.repo.candidatesForSpec(c.activeSpecId ?? 0, id).filter((x) => x.source === "simc" && x.characterId === id);
    const items = ctx.staticData.items(cands.map((x) => x.itemId));
    return {
      report: ctx.bis.repo.latestSim(id),
      results: cands
        .map((x) => ({ ...x, item: items.get(x.itemId) ?? null }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    };
  });
}
