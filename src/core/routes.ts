import type { FastifyInstance } from "fastify";
import { zoomRouter } from "../modules/zoom/router";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(zoomRouter, { prefix: "/zoom" });
}
