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
import { ZoomHttpClient } from "../modules/zoom/http";
import { ZoomRepository } from "../modules/zoom/respository";

async function main() {
  console.log("Iniciando prueba...");

  const db = await initDb(env.DB_CONNECTIONS);
  console.log("BD conectada:", db.list());

  const service = new ZoomService(new ZoomHttpClient(), new ZoomRepository(db));

  // const service = new HubspotService(
  //   new HubspotHttpClient(),
  //   new HubspotRepository(db),
  // );

  // const service = new TiService(new TiRepository(db), new MoodleHttpClient());
  //
  // const result = await service.sincronizar(6078);
  // const result = await service.sincronizarConsolidado();

  // const result = await service.sincronizarMeetingsRooms();
  // const result = await service.sincronizarInstancias();
  // const result = await service.sincronizarParticipantesRaw();
  // const result = await service.sincronizarParticipantes();
  const result = await service.sincronizarAsistencias(20262);

  console.log("Resultado:", result);

  await db.closeAll();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
