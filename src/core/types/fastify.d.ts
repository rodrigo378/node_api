import "fastify";
import type { DbRegistry } from "../db/registry";

declare module "fastify" {
  interface FastifyInstance {
    db: DbRegistry;
  }
}
