import { DateTime } from "luxon";
import { ZoomHttpClient } from "./http";
import {
  ZoomMeetingParticipant,
  ZoomMeetingReportItem,
  ZoomMeetingsReportResponse,
  ZoomUser,
} from "./types";
import { ZoomRepository } from "./repository";

type ZoomMeetingMerged = Omit<ZoomMeetingReportItem, "uuid"> & {
  uuid: string | string[];
  shortname?: string | undefined;
  participantes?: ZoomMeetingParticipant[] | undefined;
};
type ParticipantSegment = ZoomMeetingParticipant;

export class ZoomService {
  PERU_TZ = "America/Lima";
  fecha = "2026-02-10";
  GAP_MINUTES = 10;

  participantKey(p: ZoomMeetingParticipant): string {
    return (
      (p as any).participant_user_id ||
      p.id ||
      p.user_email ||
      String(p.user_id || "") ||
      `name:${(p.name || "").trim().toLowerCase()}`
    );
  }

  toDT(iso: string) {
    // join_time/leave_time vienen en Z (UTC)
    return DateTime.fromISO(iso, { zone: "utc" });
  }

  mergeParticipantSessionsByGap(
    participants: ZoomMeetingParticipant[],
    gapMinutes = this.GAP_MINUTES,
  ): ZoomMeetingParticipant[] {
    const byKey = new Map<string, ZoomMeetingParticipant[]>();

    for (const p of participants) {
      if (!p.join_time || !p.leave_time) continue;
      const k = this.participantKey(p);
      const arr = byKey.get(k) ?? [];
      arr.push(p);
      byKey.set(k, arr);
    }

    const out: ZoomMeetingParticipant[] = [];

    for (const [, arr] of byKey) {
      arr.sort((a, b) => Date.parse(a.join_time) - Date.parse(b.join_time));

      let current: ZoomMeetingParticipant | null = null;

      for (const p of arr) {
        if (!current) {
          current = { ...p };
          continue;
        }

        const curLeave = this.toDT(current.leave_time);
        const nextJoin = this.toDT(p.join_time);

        // si nextJoin <= curLeave + gap => merge
        if (
          nextJoin.toMillis() <=
          curLeave.plus({ minutes: gapMinutes }).toMillis()
        ) {
          const nextLeave = this.toDT(p.leave_time);

          // leave_time máximo
          if (nextLeave > curLeave) {
            current.leave_time = p.leave_time;
          }

          // join_time mínimo (por si hay rarezas)
          if (this.toDT(p.join_time) < this.toDT(current.join_time)) {
            current.join_time = p.join_time;
          }

          // suma duration (Zoom ya te lo trae por sesión)
          current.duration = (current.duration || 0) + (p.duration || 0);
        } else {
          // gap grande => cerramos segmento y empezamos otro
          out.push(current);
          current = { ...p };
        }
      }

      if (current) out.push(current);
    }

    return out;
  }

  constructor(
    private zoomHttp: ZoomHttpClient,
    private readonly zoomRepository: ZoomRepository,
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

  private async mapWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
  ) {
    const results: R[] = new Array(items.length);
    let index = 0;

    const run = async () => {
      while (true) {
        const current = index++;
        if (current >= items.length) break;

        const item = items[current];
        if (item === undefined) continue;
        results[current] = await worker(item);
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => run(),
    );

    await Promise.all(workers);
    return results;
  }

  async getReuniones() {
    const usuarios = await this.getUsuarios();

    const param_from = "2026-01-17";
    const param_to = "2026-02-17";
    const page_size = 300;

    const meetingsPerUser = await this.mapWithConcurrency(
      usuarios,
      3,
      async (u) => {
        const resp: ZoomMeetingsReportResponse =
          await this.zoomHttp.getReuniones(
            u.id,
            param_from,
            param_to,
            page_size,
          );

        return resp.meetings as ZoomMeetingReportItem[];
      },
    );

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
    // const ge = this.zoomRepository.getEstudiantes();
    // return ge;

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
        reu.participantes = this.mergeParticipantSessionsByGap(
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
        reu.participantes = this.mergeParticipantSessionsByGap(
          participantes,
          10,
        );
      }
    }

    return reuniones;
  }
}
