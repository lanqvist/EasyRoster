import fs from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@easyroster/core";
import { createContext } from "./context.js";
import { configRoutes } from "./routes/config.js";
import { rosterRoutes } from "./routes/roster.js";
import { lootRoutes } from "./routes/loot.js";
import { bisRoutes } from "./routes/bis.js";
import { DB_PATH, WEB_DIST } from "./paths.js";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  const ctx = createContext({
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
    error: (m) => app.log.error(m),
  });

  app.get("/api/health", async (): Promise<HealthResponse> => ({
    ok: true,
    version: VERSION,
    setupComplete: ctx.config.get().setupComplete,
    dbPath: DB_PATH,
  }));

  await configRoutes(app, ctx);
  await rosterRoutes(app, ctx);
  await lootRoutes(app, ctx);
  await bisRoutes(app, ctx);
  ctx.sync.startScheduler();

  // Справочники: при первом запуске / устаревании подтягиваем в фоне
  if (ctx.staticData.status().items === 0) {
    void ctx.staticData
      .refresh()
      .then(() => ctx.items.localizeSeasonItems())
      .catch((e) => app.log.warn(`Raidbots static: ${(e as Error).message}`));
  }

  // Собранный фронтенд (если есть) — SPA fallback на index.html.
  if (fs.existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({
      message: "EasyRoster API работает. Фронтенд не собран: npm run build или npm run dev:web (http://localhost:5173).",
    }));
  }

  const port = ctx.config.get().server.port;
  await app.listen({ port, host: "127.0.0.1" });
  app.log.info(`EasyRoster ${VERSION} → http://localhost:${port}`);

  const shutdown = () => {
    app.close().finally(() => {
      ctx.db.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
