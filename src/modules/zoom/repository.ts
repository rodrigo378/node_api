import type { Knex } from "knex";
import type { DbRegistry } from "../../core/db/registry";

export type DbName = "SIGU_LECTURA" | "SIGU_ESCRITURA"; // agrega las que tengas

export class ZoomRepository {
  constructor(private readonly registry: DbRegistry) {}

  private db(dbName: DbName): Knex {
    return this.registry.get(dbName);
  }

  async getEstudiantes() {
    const [rows] = await this.db("SIGU_LECTURA").raw(
      "SELECT * FROM tb_doc_cur_grp WHERE n_codper = ?",
      [20261],
    );

    return rows;
  }
}
