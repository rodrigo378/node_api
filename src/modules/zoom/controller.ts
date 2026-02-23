import type { FastifyReply, FastifyRequest } from "fastify";
import { ZoomService } from "./service";

export class ZoomController {
  constructor(private service: ZoomService) {}

  getUsusarios = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.enriquerReuniones();
    return reply.send(data);
  };
}
