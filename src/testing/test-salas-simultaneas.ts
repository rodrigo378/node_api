// worker-sync/src/testing/test-salas-simultaneas.ts

import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";
import { ZoomService } from "../modules/zoom/service";
import { ZoomHttpClient } from "../modules/zoom/http";
import { ZoomRepository } from "../modules/zoom/respository";

async function main() {
  console.log("Detectando salas con reuniones simultaneas...");

  // Uso: npm run test:salas [min]
  // - min: minimo de reuniones simultaneas a reportar (por defecto 3).
  // Reporta TODOS los choques (sala + fecha + horas), sin filtrar por dia.
  const min = Number(process.argv[2]) || 3;

  console.log(`Filtro: min=${min} (todas las fechas)`);

  const db = await initDb(env.DB_CONNECTIONS);
  console.log("BD conectada:", db.list());

  const service = new ZoomService(new ZoomHttpClient(), new ZoomRepository(db));

  console.log("\n===== REALES (instances) =====");
  await service.detectarSalasSimultaneas("instance", min);

  console.log("\n===== PROGRAMADAS (occurrences) =====");
  await service.detectarSalasSimultaneas("occurrence", min);

  await db.closeAll();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
