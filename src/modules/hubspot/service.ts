import { HubspotHttpClient } from "./http";
import { HubspotRepository } from "./repository";
import { Api_Hubspot, Api_Hubspot_Consolidado } from "./types/db.types";

// ===================================================================================
export class HubspotService {
  // ===================================================================================
  constructor(
    private readonly http: HubspotHttpClient,
    private readonly repo: HubspotRepository,
  ) {}

  // ===================================================================================
  private toDate(value: unknown): Date {
    if (!value) return new Date();

    const date = value instanceof Date ? value : new Date(String(value));

    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private buildOwnerName(firstName?: string, lastName?: string): string | null {
    const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();

    return name.length > 0 ? name : null;
  }

  // ===================================================================================
  async sincronizarContactos() {
    console.log("se inicio sincro contacto");

    const ownersResponse = await this.http.getOwerns();

    const ownersById = new Map<string, string | null>(
      ownersResponse.results.map((owner) => [
        String(owner.id),
        this.buildOwnerName(owner.firstName, owner.lastName),
      ]),
    );

    let after: string | undefined;
    let totalInsertados = 0;
    const BUFFER_SIZE = 1000;
    let buffer: Api_Hubspot[] = [];

    do {
      const response = await this.http.getContactos(after);

      const responseContactos: Api_Hubspot[] = response.results.map(
        (c: any) => {
          const ownerId = c.properties.hubspot_owner_id ?? null;

          return {
            id: c.id,

            firstname: c.properties.firstname ?? null,
            lastname: c.properties.lastname ?? null,
            carrera_o_especialidad: c.properties.carrera_o_especialidad ?? null,
            hs_lead_status: c.properties.hs_lead_status ?? null,
            canal: c.properties.canal ?? null,
            email: c.properties.email ?? null,
            mobilphone: c.properties.mobilphone ?? null,
            campana_admision: c.properties.campana_admision ?? null,
            como_te_enteraste: c.properties.como_te_enteraste ?? null,
            n__de_d_n_i: c.properties.n__de_d_n_i ?? null,
            phone: c.properties.phone ?? null,
            edad: c.properties.edad ?? null,
            modalidad_de_estudio: c.properties.modalidad_de_estudio ?? null,
            turno: c.properties.turno ?? null,
            tipo_de_ingreso: c.properties.tipo_de_ingreso ?? null,
            colegio_de_procedencia: c.properties.colegio_de_procedencia ?? null,
            fecha_de_inscripcion: c.properties.fecha_de_inscripcion ?? null,
            fecha_de_pagante: c.properties.fecha_de_pagante ?? null,
            fecha_de_matricula: c.properties.fecha_de_matricula ?? null,
            departamento: c.properties.departamento ?? null,
            provincia_de_procedencia:
              c.properties.provincia_de_procedencia ?? null,
            distrito_de_procedencia:
              c.properties.distrito_de_procedencia ?? null,
            colegio: c.properties.colegio ?? null,
            instituto_de_procedencia:
              c.properties.instituto_de_procedencia ?? null,
            universidad_de_procedencia:
              c.properties.universidad_de_procedencia ?? null,
            genero_m__f: c.properties.genero_m__f ?? null,
            estado_matricula: c.properties.estado_matricula ?? null,
            estado_pagos: c.properties.estado_pagos ?? null,
            estado_postulante: c.properties.estado_postulante ?? null,

            owern_name: ownerId
              ? (ownersById.get(String(ownerId)) ?? null)
              : null,

            created_at: this.toDate(c.createdAt),
            updated_at: this.toDate(c.updatedAt),
          };
        },
      );

      buffer.push(...responseContactos);
      after = response.paging?.next?.after;

      if (buffer.length >= BUFFER_SIZE) {
        console.log("BUFFER_SIZE => ", BUFFER_SIZE);
        console.log("totalInsertados => ", totalInsertados);

        await this.repo.upsertManyHubspot(buffer);
        totalInsertados += buffer.length;
        buffer = [];
      }
    } while (after);

    if (buffer.length > 0) {
      await this.repo.upsertManyHubspot(buffer);
      totalInsertados += buffer.length;
    }

    return totalInsertados;
  }

  // ===================================================================================
  async sincronizarConsolidado() {
    console.log("inicio consolidado Hubspot");

    const contactos = await this.repo.getContactos();

    const grupos = new Map<string, Api_Hubspot[]>();

    for (const contacto of contactos) {
      if (!contacto.n__de_d_n_i) continue;

      const key = `${contacto.n__de_d_n_i}-${contacto.campana_admision ?? ""}`;

      if (!grupos.has(key)) {
        grupos.set(key, []);
      }

      grupos.get(key)!.push(contacto);
    }

    const arrayContactos: Api_Hubspot_Consolidado[] = [];

    for (const contactosGrupo of grupos.values()) {
      const base = contactosGrupo[0];
      //
      if (!base) continue;

      arrayContactos.push({
        id: base.id,

        n__de_d_n_i: base.n__de_d_n_i ?? null,
        campana_admision: base.campana_admision ?? null,
        firstname: base.firstname ?? null,
        lastname: base.lastname ?? null,
        carrera_o_especialidad: base.carrera_o_especialidad ?? null,
        hs_lead_status: base.hs_lead_status ?? null,
        canal: base.canal ?? null,
        email: base.email ?? null,
        mobilphone: base.mobilphone ?? null,
        como_te_enteraste: base.como_te_enteraste ?? null,
        phone: base.phone ?? null,
        edad: base.edad ?? null,
        modalidad_de_estudio: base.modalidad_de_estudio ?? null,
        turno: base.turno ?? null,
        tipo_de_ingreso: base.tipo_de_ingreso ?? null,
        colegio_de_procedencia: base.colegio_de_procedencia ?? null,
        fecha_de_inscripcion: base.fecha_de_inscripcion ?? null,
        fecha_de_pagante: base.fecha_de_pagante ?? null,
        fecha_de_matricula: base.fecha_de_matricula ?? null,
        departamento: base.departamento ?? null,
        provincia_de_procedencia: base.provincia_de_procedencia ?? null,
        distrito_de_procedencia: base.distrito_de_procedencia ?? null,
        colegio: base.colegio ?? null,
        instituto_de_procedencia: base.instituto_de_procedencia ?? null,
        universidad_de_procedencia: base.universidad_de_procedencia ?? null,
        genero_m__f: base.genero_m__f ?? null,
        estado_matricula: base.estado_matricula ?? null,
        estado_pagos: base.estado_pagos ?? null,
        estado_postulante: base.estado_postulante ?? null,

        owern_name: base.owern_name ?? null,

        cantidad: String(contactosGrupo.length),
        ids: contactosGrupo.map((c) => c.id).join(","),

        created_at: base.created_at ?? new Date(),
        updated_at: base.updated_at ?? new Date(),
      });
    }

    await this.repo.upsertManyHubspotConsolidado(arrayContactos);

    console.log("fin consolidado Hubspot");

    return true;
  }

  // ===================================================================================
  async sincronizarHubspot() {
    console.log("inicio sincronización completa Hubspot");

    const totalContactos = await this.sincronizarContactos();

    await this.sincronizarConsolidado();

    console.log("fin sincronización completa Hubspot");

    return {
      ok: true,
      totalContactos,
    };
  }
}
