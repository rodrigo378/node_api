// worker-sync/src/testing/test-hubspot.ts

import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";
import { ZoomService } from "../modules/zoom/service";
import { HubspotService } from "../modules/hubspot/service";
import { HubspotHttpClient } from "../modules/hubspot/http";
import { HubspotRepository } from "../modules/hubspot/repository";
import { TiService } from "../modules/ti/service";
import { MoodleHttpClient } from "../modules/ti/http";
import { TiRepository } from "../modules/ti/repository";
// 5895

async function main() {
  console.log("Iniciando prueba...");

  const db = await initDb(env.DB_CONNECTIONS);
  console.log("BD conectada:", db.list());

  // const service = new ZoomService(new ZoomHttpClient(), new ZoomRepository(db));
  // const service = new HubspotService(
  //   new HubspotHttpClient(),
  //   new HubspotRepository(db),
  // );
  const service = new TiService(new TiRepository(db), new MoodleHttpClient());
  const result = await service.sincronizar(5895);
  console.log("Resultado:", result);

  await db.closeAll();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
