import type { FastifyInstance } from "fastify";
import { ZoomHttpClient } from "./http";
import { ZoomService } from "./service";
import { ZoomController } from "./controller";

export async function zoomRouter(app: FastifyInstance) {
  const http = new ZoomHttpClient();
  const service = new ZoomService(http);
  const controller = new ZoomController(service);

  app.get("/users", controller.getUsusarios);
}
