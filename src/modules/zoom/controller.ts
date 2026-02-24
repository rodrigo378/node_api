import type { FastifyReply, FastifyRequest } from "fastify";
import { ZoomService } from "./service";

export class ZoomController {
  constructor(private service: ZoomService) {}

  getUsusarios = async (_req: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.procesarAsistenciaZoom();
    // const data = await this.service.getReuniones();
    return reply.send(data);
  };
}
