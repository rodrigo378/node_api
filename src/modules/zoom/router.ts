import type { FastifyInstance } from "fastify";
import { ZoomHttpClient } from "./http";
import { ZoomService } from "./service";
import { ZoomController } from "./controller";
import { ZoomRepository } from "./repository";

export async function zoomRouter(app: FastifyInstance) {
  const http = new ZoomHttpClient();

  const repository = new ZoomRepository(app.db);
  const service = new ZoomService(http, repository);

  const controller = new ZoomController(service);

  app.get("/users", controller.getUsusarios);
}
