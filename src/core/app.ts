import Fastify from "fastify";
import { env } from "./config/env";
import { initDb } from "./db";
import { registerRoutes } from "./routes";

export async function buildApp() {
  const app = Fastify({ logger: true });

  const db = await initDb(env.DB_CONNECTIONS);
  app.decorate("db", db);

  await registerRoutes(app);

  app.addHook("onClose", async () => {
    await db.closeAll();
  });

  return app;
}
