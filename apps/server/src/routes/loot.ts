import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LootInstanceView } from "@easyroster/core";
import type { AppContext } from "../context.js";

export async function lootRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/api/static/status", async () => ctx.staticData.status());

  app.post("/api/static/refresh", async (req, reply) => {
    const q = z.object({ force: z.boolean().optional() }).parse(req.body ?? {});
    try {
      const r = await ctx.staticData.refresh(q.force ?? false);
      // подтянуть русские имена предметов сезона в фоне (если есть ключи Blizzard)
      void ctx.items.localizeSeasonItems().then(() => ctx.items.localizeSeasonInstances()).catch(() => undefined);
      return r;
    } catch (e) {
      reply.code(502);
      return { error: (e as Error).message };
    }
  });

  app.get("/api/loot/instances", async () => {
    const s = ctx.staticData.seasonInfo();
    return { season: s, all: ctx.staticData.listInstances().filter((i) => i.type === "raid" || i.type === "mplus-chest" || i.type === "expansion-dungeon") };
  });

  app.get("/api/loot/instances/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const instance = ctx.staticData.instance(id);
    if (!instance) {
      reply.code(404);
      return { error: "Инстанс не найден" };
    }
    const loot = ctx.staticData.instanceLoot(id);
    const byEnc = new Map<number, LootInstanceView["encounters"][number]>();
    for (const e of instance.encounters) byEnc.set(e.id, { id: e.id, name: e.name, items: [] });
    for (const it of loot) {
      const { encounterId, ...item } = it;
      let enc = byEnc.get(encounterId);
      if (!enc) {
        enc = { id: encounterId, name: `#${encounterId}`, items: [] };
        byEnc.set(encounterId, enc);
      }
      enc.items.push(item);
    }
    const view: LootInstanceView = { instance, encounters: [...byEnc.values()] };
    return view;
  });

  app.get("/api/items/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const item = ctx.staticData.item(id);
    if (!item) {
      reply.code(404);
      return { error: "Предмет не найден" };
    }
    return { item, sources: ctx.staticData.itemSources(id) };
  });
}
