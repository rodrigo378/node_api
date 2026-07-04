// src/main.ts
import "dotenv/config";
import { env } from "./core/config/env";
import { initDb } from "./core/db";
import { startWorkers } from "./core/queue/worker";

async function main() {
  const db = await initDb(env.DB_CONNECTIONS);
  console.log("BD conectada:", db.list());

  // Registra schedules estáticos en Redis
  // await registerSchedules();

  // Arranca workers. El estado/health se consulta por la cola 'health'
  // (ver HANDOFF_HEALTH.md), no por HTTP.
  const { closeAll } = startWorkers(db);

  console.log("worker-sync iniciado");

  const shutdown = async () => {
    console.log("Cerrando worker-sync...");
    await closeAll();
    await db.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
