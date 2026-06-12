import { Knex } from "knex";
import { DbName } from "../../core/const/db.const";
import { DbRegistry } from "../../core/db/registry";
import { Api_Hubspot, Api_Hubspot_Consolidado } from "./types/db.types";

// ===================================================================================
export class HubspotRepository {
  // ===================================================================================
  constructor(private readonly registry: DbRegistry) {}

  // ===================================================================================
  public db(dbName: DbName): Knex {
    return this.registry.get(dbName);
  }

  // ===================================================================================
  private toMysqlDate(value: unknown): string | null {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(String(value));

    if (Number.isNaN(date.getTime())) return null;

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value.padStart(2, "0");

    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get(
      "minute",
    )}:${get("second")}`;
  }

  // ===================================================================================
  async upsertManyHubspot(data: Api_Hubspot[]) {
    if (!data.length) return true;

    const db = this.db("API_2");
    const BATCH_SIZE = 500;

    const now = this.toMysqlDate(new Date());

    const rows = data.map((d) => ({
      id: d.id,

      firstname: d.firstname ?? null,
      lastname: d.lastname ?? null,
      carrera_o_especialidad: d.carrera_o_especialidad ?? null,
      hs_lead_status: d.hs_lead_status ?? null,
      canal: d.canal ?? null,
      email: d.email ?? null,
      mobilphone: d.mobilphone ?? null,
      campana_admision: d.campana_admision ?? null,
      como_te_enteraste: d.como_te_enteraste ?? null,
      n__de_d_n_i: d.n__de_d_n_i ?? null,
      phone: d.phone ?? null,
      edad: d.edad ?? null,
      modalidad_de_estudio: d.modalidad_de_estudio ?? null,
      turno: d.turno ?? null,
      tipo_de_ingreso: d.tipo_de_ingreso ?? null,
      colegio_de_procedencia: d.colegio_de_procedencia ?? null,
      fecha_de_inscripcion: d.fecha_de_inscripcion ?? null,
      fecha_de_pagante: d.fecha_de_pagante ?? null,
      fecha_de_matricula: d.fecha_de_matricula ?? null,
      departamento: d.departamento ?? null,
      provincia_de_procedencia: d.provincia_de_procedencia ?? null,
      distrito_de_procedencia: d.distrito_de_procedencia ?? null,
      colegio: d.colegio ?? null,
      instituto_de_procedencia: d.instituto_de_procedencia ?? null,
      universidad_de_procedencia: d.universidad_de_procedencia ?? null,
      genero_m__f: d.genero_m__f ?? null,
      estado_matricula: d.estado_matricula ?? null,
      estado_pagos: d.estado_pagos ?? null,
      estado_postulante: d.estado_postulante ?? null,

      created_at: this.toMysqlDate(d.created_at) ?? now,
      updated_at: this.toMysqlDate(d.updated_at) ?? now,
    }));

    const columnasUpdate = [
      "firstname",
      "lastname",
      "carrera_o_especialidad",
      "hs_lead_status",
      "canal",
      "email",
      "mobilphone",
      "campana_admision",
      "como_te_enteraste",
      "n__de_d_n_i",
      "phone",
      "edad",
      "modalidad_de_estudio",
      "turno",
      "tipo_de_ingreso",
      "colegio_de_procedencia",
      "fecha_de_inscripcion",
      "fecha_de_pagante",
      "fecha_de_matricula",
      "departamento",
      "provincia_de_procedencia",
      "distrito_de_procedencia",
      "colegio",
      "instituto_de_procedencia",
      "universidad_de_procedencia",
      "genero_m__f",
      "estado_matricula",
      "estado_pagos",
      "estado_postulante",
      "updated_at",
    ];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);

      await db("api_hubspot")
        .insert(chunk)
        .onConflict("id")
        .merge(
          columnasUpdate.reduce<Record<string, Knex.Raw>>((acc, column) => {
            acc[column] = db.raw(`VALUES(??)`, [column]);
            return acc;
          }, {}),
        );
    }

    return true;
  }

  // ===================================================================================
  async upsertManyHubspotConsolidado(data: Api_Hubspot_Consolidado[]) {
    if (!data.length) return true;

    const db = this.db("API_2");
    const BATCH_SIZE = 500;

    const now = this.toMysqlDate(new Date());

    const rows = data.map((d) => ({
      id: d.id,

      n__de_d_n_i: d.n__de_d_n_i ?? null,
      campana_admision: d.campana_admision ?? null,
      firstname: d.firstname ?? null,
      lastname: d.lastname ?? null,
      carrera_o_especialidad: d.carrera_o_especialidad ?? null,
      hs_lead_status: d.hs_lead_status ?? null,
      canal: d.canal ?? null,
      email: d.email ?? null,
      mobilphone: d.mobilphone ?? null,
      como_te_enteraste: d.como_te_enteraste ?? null,
      phone: d.phone ?? null,
      edad: d.edad ?? null,
      modalidad_de_estudio: d.modalidad_de_estudio ?? null,
      turno: d.turno ?? null,
      tipo_de_ingreso: d.tipo_de_ingreso ?? null,
      colegio_de_procedencia: d.colegio_de_procedencia ?? null,
      fecha_de_inscripcion: d.fecha_de_inscripcion ?? null,
      fecha_de_pagante: d.fecha_de_pagante ?? null,
      fecha_de_matricula: d.fecha_de_matricula ?? null,
      departamento: d.departamento ?? null,
      provincia_de_procedencia: d.provincia_de_procedencia ?? null,
      distrito_de_procedencia: d.distrito_de_procedencia ?? null,
      colegio: d.colegio ?? null,
      instituto_de_procedencia: d.instituto_de_procedencia ?? null,
      universidad_de_procedencia: d.universidad_de_procedencia ?? null,
      genero_m__f: d.genero_m__f ?? null,
      estado_matricula: d.estado_matricula ?? null,
      estado_pagos: d.estado_pagos ?? null,
      estado_postulante: d.estado_postulante ?? null,
      cantidad: d.cantidad ?? null,
      ids: d.ids ?? null,

      created_at: this.toMysqlDate(d.created_at) ?? now,
      updated_at: this.toMysqlDate(d.updated_at) ?? now,
    }));

    const columnasUpdate = [
      "n__de_d_n_i",
      "campana_admision",
      "firstname",
      "lastname",
      "carrera_o_especialidad",
      "hs_lead_status",
      "canal",
      "email",
      "mobilphone",
      "como_te_enteraste",
      "phone",
      "edad",
      "modalidad_de_estudio",
      "turno",
      "tipo_de_ingreso",
      "colegio_de_procedencia",
      "fecha_de_inscripcion",
      "fecha_de_pagante",
      "fecha_de_matricula",
      "departamento",
      "provincia_de_procedencia",
      "distrito_de_procedencia",
      "colegio",
      "instituto_de_procedencia",
      "universidad_de_procedencia",
      "genero_m__f",
      "estado_matricula",
      "estado_pagos",
      "estado_postulante",
      "cantidad",
      "ids",
      "updated_at",
    ];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);

      const idsChunk = chunk.map((r) => r.id);
      const placeholdersIds = idsChunk.map(() => "?").join(",");

      const caseDni = chunk.map(() => "WHEN ? THEN ?").join(" ");
      const caseCamp = chunk.map(() => "WHEN ? THEN ?").join(" ");

      const paramsCaseDni = chunk.flatMap((r) => [r.id, r.n__de_d_n_i]);
      const paramsCaseCamp = chunk.flatMap((r) => [r.id, r.campana_admision]);

      const deleteSql = `
        DELETE FROM \`api_hubspot_consolidado\`
        WHERE id IN (${placeholdersIds})
          AND (
            IFNULL(n__de_d_n_i, '') <> CASE id ${caseDni} ELSE IFNULL(n__de_d_n_i, '') END
            OR IFNULL(campana_admision, '') <> CASE id ${caseCamp} ELSE IFNULL(campana_admision, '') END
          )
      `;

      const deleteParams = [...idsChunk, ...paramsCaseDni, ...paramsCaseCamp];

      await db.raw(deleteSql, deleteParams);

      const columnas = Object.keys(chunk[0]!);

      const placeholders = chunk
        .map(() => `(${columnas.map(() => "?").join(", ")})`)
        .join(", ");

      const valores = chunk.flatMap((row) =>
        columnas.map((column) => (row as any)[column]),
      );

      const updateClause = columnasUpdate
        .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
        .join(", ");

      const sql = `
        INSERT INTO \`api_hubspot_consolidado\`
        (${columnas.map((column) => `\`${column}\``).join(", ")})
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE ${updateClause}
      `;

      await db.raw(sql, valores);
    }

    return true;
  }

  // ===================================================================================
  async getContactos() {
    const [rows] = await this.db("API_2").raw(`
      SELECT * FROM api_hubspot
    `);

    return rows as Api_Hubspot[];
  }

  // ===================================================================================
  async isSyncRunning() {
    const db = this.db("API_2");
    const lockName = "hubspot_sync_lock";

    const result: any = await db.raw(`SELECT IS_USED_LOCK(?) as used_by`, [
      lockName,
    ]);

    return result;
  }
}
