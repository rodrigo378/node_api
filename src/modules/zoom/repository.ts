import { Knex } from "knex";
import { DbRegistry } from "../../core/db/registry";

export class ZoomRepository {
  private db: Knex;

  constructor(registry: DbRegistry, dbName = "SIGU_LECTURA") {
    this.db = registry.get(dbName);
  }

  async getEstudiantes() {
    const [rows] = await this.db.raw(
      "SELECT * FROM tb_doc_cur_grp WHERE n_codper = ?",
      [20261],
    );

    return rows;
  }
}
