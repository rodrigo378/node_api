import { buildApp } from "./core/app";
import { env } from "./core/config/env";

async function main() {
  const app = await buildApp();

  app.get("/health", async () => ({
    ok: true,
    dbs: app.db.list(),
  }));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
