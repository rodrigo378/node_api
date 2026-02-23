import { DateTime } from "luxon";
import { ZoomHttpClient } from "./http";
import {
  ZoomMeetingParticipant,
  ZoomMeetingReportItem,
  ZoomMeetingsReportResponse,
  ZoomUser,
} from "./types";
import { ZoomRepository } from "./repository";
import { mapWithConcurrency, mergeParticipant } from "./helpers";

type ZoomMeetingMerged = Omit<ZoomMeetingReportItem, "uuid"> & {
  uuid: string | string[];
  shortname?: string | undefined;
  participantes?: ZoomMeetingParticipant[] | undefined;
};

export class ZoomService {
  PERU_TZ = "America/Lima";
  fecha = "2026-02-10";
  GAP_MINUTES = 10;

  constructor(
    private zoomHttp: ZoomHttpClient,
    private zoomRepository: ZoomRepository,
  ) {}

  async getUsuarios() {
    // const page_number = 1;
    // const page_size = 2000;

    // const usuarios: ZoomUser[] = [];
    // const resp = await this.zoomHttp.getUsers(page_size, page_number);
    // const page_count = resp.page_count;
    // usuarios.push(...resp.users);

    // for (let i = 1; i <= page_count; i++) {
    //   const resp = await this.zoomHttp.getUsers(page_size, i);
    //   usuarios.push(...resp.users);
    // }
    const usuarios: ZoomUser[] = [
      {
        id: "gw0or1fOS0y8uPZvScgpUw",
        first_name: "SALA 13",
        last_name: "UMA",
        display_name: "SALA 13 UMA",
        email: "sala13@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:59:08Z",
        last_login_time: "2026-02-11T19:40:18Z",
        status: "active",
      },
    ];

    return usuarios;
  }

  async getReuniones() {
    const usuarios = await this.getUsuarios();

    const param_from = "2026-01-17";
    const param_to = "2026-02-17";
    const page_size = 300;

    const meetingsPerUser = await mapWithConcurrency(usuarios, 3, async (u) => {
      const resp: ZoomMeetingsReportResponse = await this.zoomHttp.getReuniones(
        u.id,
        param_from,
        param_to,
        page_size,
      );

      return resp.meetings as ZoomMeetingReportItem[];
    });

    const reuniones: ZoomMeetingReportItem[] = meetingsPerUser.flat();

    for (const r of reuniones) {
      if (r.start_time) {
        r.start_time =
          DateTime.fromISO(r.start_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.start_time;
      }
      if (r.end_time) {
        r.end_time =
          DateTime.fromISO(r.end_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.end_time;
      }
    }

    return reuniones;
  }

  async filtrarReuniones() {
    const reuniones = await this.getReuniones();

    for (const r of reuniones) {
      if (r.start_time) {
        r.start_time =
          DateTime.fromISO(r.start_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.start_time;
      }
      if (r.end_time) {
        r.end_time =
          DateTime.fromISO(r.end_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.end_time;
      }
    }

    const reunionesDia = reuniones.filter((r) => {
      if (!r.start_time) return false;
      const d = DateTime.fromISO(r.start_time, {
        zone: this.PERU_TZ,
      }).toISODate();
      return d === this.fecha;
    });

    // return reunionesDia;
    return this.mergedUuidArray(reunionesDia);
  }

  async mergedUuidArray(reuniones: ZoomMeetingReportItem[]) {
    const grupos = new Map<number, ZoomMeetingReportItem[]>();

    for (const r of reuniones) {
      const arr = grupos.get(r.id) ?? [];
      arr.push(r);
      grupos.set(r.id, arr);
    }

    const merged: ZoomMeetingMerged[] = [];

    for (const [, items] of grupos) {
      if (items.length === 1) {
        merged.push(items[0]!);
        continue;
      }

      const startMin = items.reduce((min, it) => {
        const t = Date.parse(it.start_time);
        return t < min ? t : min;
      }, Number.POSITIVE_INFINITY);

      const endMax = items.reduce((max, it) => {
        const t = Date.parse(it.end_time);
        return t > max ? t : max;
      }, Number.NEGATIVE_INFINITY);

      const principal = items[0]!;

      merged.push({
        ...principal,
        uuid: items.map((x) => x.uuid),
        start_time:
          DateTime.fromISO(new Date(startMin).toISOString(), { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? new Date(startMin).toISOString(),
        end_time:
          DateTime.fromISO(new Date(endMax).toISOString(), { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? new Date(endMax).toISOString(),
      });
    }

    return merged;
  }

  async enriquerReuniones() {
    const reuniones = await this.filtrarReuniones();

    for (const reu of reuniones) {
      if (typeof reu.uuid === "string") {
        const respDetalle = await this.zoomHttp.getDetalleReunion(reu.uuid);
        const respParticipantes = await this.zoomHttp.getParticipantesReunion(
          reu.uuid,
          300,
        );

        const shortname = respDetalle.tracking_fields?.find(
          (t) => t.field === "shortname",
        )?.value;

        reu.shortname = shortname;
        // reu.participantes = respParticipantes.participants;
        reu.participantes = await mergeParticipant(
          respParticipantes.participants,
          10,
        );
      }

      if (typeof reu.uuid === "object") {
        const respDetalle = await this.zoomHttp.getDetalleReunion(reu.uuid[0]!);
        const shortname = respDetalle.tracking_fields?.find(
          (t) => t.field === "shortname",
        )?.value;

        const participantes = [];

        for (const uuid of reu.uuid) {
          participantes.push(
            ...(await this.zoomHttp.getParticipantesReunion(uuid, 300))
              .participants,
          );
        }

        reu.shortname = shortname;
        // reu.participantes = participantes;
        reu.participantes = await mergeParticipant(participantes, 10);
      }
    }

    return reuniones;
  }
}
