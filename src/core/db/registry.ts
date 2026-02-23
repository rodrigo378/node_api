import type { Knex } from "knex";

export class DbRegistry {
  private conns = new Map<string, Knex>();

  set(name: string, conn: Knex) {
    this.conns.set(name, conn);
  }

  get(name: string): Knex {
    const conn = this.conns.get(name);
    if (!conn) throw new Error(`DB connection not found: ${name}`);
    return conn;
  }

  list(): string[] {
    return [...this.conns.keys()];
  }

  async closeAll() {
    for (const [, conn] of this.conns) {
      await conn.destroy();
    }
    this.conns.clear();
  }
}
