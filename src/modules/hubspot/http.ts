import { env } from "../../core/config/env";
import { request } from "undici";

export class HubspotHttpClient {
  private token = env.HUBSPOT.TOKEN;
  private base_url = env.HUBSPOT.BASE_URL;

  async getContactos(after?: string) {
    const page_size = 100;

    const params = new URLSearchParams({
      limit: String(page_size),
      properties: [
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
        "hubspot_owner_id",
      ].join(","),
    });

    if (after) params.set("after", after);

    const res = await request(
      `${this.base_url}/crm/v3/objects/contacts?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      const errorBody = await res.body.text();
      throw new Error(`HubSpot list error: ${res.statusCode} - ${errorBody}`);
    }

    return (await res.body.json()) as {
      results: any[];
      paging: {
        next: {
          after: string;
          link: string;
        };
      };
    };
  }

  // https://api.hubapi.com/crm/v3/owners/?limit=200&includeInactive=true
  async getOwerns() {
    const res = await request(
      `${this.base_url}/crm/v3/owners/?limit=200&includeInactive=true`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      },
    );

    return (await res.body.json()) as {
      results: {
        id: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        userId?: number;
      }[];
    };
  }
}
