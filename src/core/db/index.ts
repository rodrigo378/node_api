import knex, { type Knex } from "knex";
import type { DbConn } from "../config/env";
import { DbRegistry } from "./registry";

export async function initDb(connections: DbConn[]) {
  const registry = new DbRegistry();

  for (const c of connections) {
    const k: Knex = knex({
      client: "mysql2",
      connection: {
        host: c.host,
        port: c.port,
        user: c.user,
        password: c.password,
        database: c.database,
        // ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
      },
      pool: {
        // min: c.poolMin ?? 0,
        // max: c.poolMax ?? 10,
      },
    });

    await k.raw("SELECT 1");

    registry.set(c.name, k);
  }

  return registry;
}
