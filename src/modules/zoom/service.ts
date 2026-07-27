import { ZoomHttpClient } from "./http";
import { ZoomRepository } from "./respository";
import {
  UpsertZoomUserInput,
  Zoom_Meeting,
  Zoom_MeetingInstance,
  Zoom_MeetingOccurrence,
  Zoom_MeetingParticipant,
} from "./types/db.types";
import { ZoomUser } from "./types/http.types";
import {
  claveBloqueDeTema,
  claveVentana,
  docentesDelBloque,
  esTardanza,
  gruposDeSlots,
  inicioProgramadoSlot,
  resolverGruposSesion,
} from "./horario";
import {
  diaSemanaLima,
  diaTextoLima,
  fechaLima,
  horaMinLima,
  minutosDiaLima,
} from "../../core/utils/time";

// ===================================================================================
export class ZoomService {
  // ===================================================================================
  constructor(
    private readonly zoomHttp: ZoomHttpClient,
    private readonly zoomRepository: ZoomRepository,
  ) {}

  // ===================================================================================
  async sincronizarUsuarios() {
    const page_number = 1;
    const page_size = 2000;

    const usuarios: ZoomUser[] = [];
    const resp = await this.zoomHttp.getUsers(page_size, page_number);

    const page_count = resp.page_count;
    usuarios.push(...resp.users);

    for (let i = 2; i <= page_count; i++) {
      const respPage = await this.zoomHttp.getUsers(page_size, i);
      usuarios.push(...respPage.users);
    }

    const map: UpsertZoomUserInput[] = usuarios.map((usuario) => ({
      zoom_user_id: String(usuario.id),
      first_name: usuario.first_name ?? null,
      last_name: usuario.last_name ?? null,
      display_name: usuario.display_name ?? null,
      email: usuario.email ?? null,
      licensed: usuario.type === 2 ? true : false,
    }));

    return await this.zoomRepository.upsertZoomRoom(map);
  }

  // ===================================================================================
  async sincronizarMeetingsRooms() {
    // const desdeDate = new Date();
    // desdeDate.setDate(desdeDate.getDate() - 7);

    // const hastaDate = new Date();
    // hastaDate.setDate(hastaDate.getDate() + 30);
    const desdeDate = new Date("2026-07-06T00:00:00.000Z");
    const hastaDate = new Date("2026-11-01T00:00:00.000Z");

    const from: string = desdeDate.toISOString();
    const to: string = hastaDate.toISOString();
    const users = await this.zoomRepository.getZoomUsers({ active: true });
    const page_size = 300;

    const meetings: Partial<Zoom_Meeting>[] = [];
    const ocurrences: Partial<Zoom_MeetingOccurrence>[] = [];

    for (const user of users) {
      let next_page_token = "";

      do {
        const res = await this.zoomHttp.getMeetingsRooms(
          user.zoom_user_id,
          from,
          to,
          page_size,
          next_page_token,
        );
        console.log("res => ", res);

        next_page_token = res.next_page_token || "";

        res.meetings.map((meeting) => {
          if (meeting.type === 1) return;

          meetings.push({
            room_id: user.id,
            zoom_meeting_id: meeting.id,
            topic: meeting.topic ?? "",
            type: meeting.type ?? null,
          });
        });
      } while (next_page_token);
    }

    for (const meeting of meetings) {
      console.log("meeting => ", meeting);

      let details;
      try {
        details = await this.zoomHttp.getMeetingsRoomsDetails(
          meeting.zoom_meeting_id!,
        );
      } catch (error) {
        console.warn(
          `No se pudo obtener detalles de la reunión ${meeting.zoom_meeting_id} (${meeting.topic}), se omite:`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }

      const shortname =
        details.tracking_fields?.find(
          (f) => f.field?.trim().toLowerCase() === "shortname",
        )?.value ?? null;

      meeting.shortname = shortname;
      meeting.agenda = details.agenda ?? "";

      ocurrences.push(
        ...(details.occurrences?.map((oc) => ({
          meeting_id: meeting.zoom_meeting_id!,
          occurrence_id: String(oc.occurrence_id),
          start_time: oc.start_time ? new Date(oc.start_time) : null,
          duration: oc.duration ?? null,
          status: oc.status ?? null,
        })) ?? []),
      );
    }

    const shortnames = [
      ...new Set(
        meetings
          .map((m) => m.shortname?.trim())
          .filter((s): s is string => !!s),
      ),
    ];

    const courseids =
      await this.zoomRepository.getCourseIdsByShortnames(shortnames);

    const courseIdsMap = new Map(
      courseids.map((c) => [c.shortname, c.courseid]),
    );

    for (const meeting of meetings) {
      const key = meeting.shortname;
      meeting.courseid = key ? (courseIdsMap.get(key) ?? null) : null;
    }
    await this.zoomRepository.upsertZoomMeetings(meetings);

    const meetingsBd = await this.zoomRepository.getMeetings();
    const meetingsMap = new Map(
      meetingsBd.map((m) => [m.zoom_meeting_id, m.id]),
    );

    const occurrencesFinal: Partial<Zoom_MeetingOccurrence>[] = [];

    for (const oc of ocurrences) {
      const meetingId = meetingsMap.get(oc.meeting_id!);

      if (!meetingId) {
        console.log("no tiene => ", meetingId);
        continue;
      }

      occurrencesFinal.push({
        meeting_id: meetingId,
        occurrence_id: String(oc.occurrence_id),
        start_time: oc.start_time ? new Date(oc.start_time) : null,
        duration: oc.duration ?? null,
        status: oc.status ?? null,
      });
    }

    await this.zoomRepository.upsertZoomMeetingOccurrences(occurrencesFinal);

    return true;
  }

  // ===================================================================================
  async detectarSalasSimultaneas(
    source: "instance" | "occurrence",
    minSimultaneas = 3,
  ) {
    // Peru es UTC-5 (sin horario de verano).
    const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;
    const enPeru = (d: Date) => new Date(d.getTime() - PERU_OFFSET_MS);
    const fechaPeru = (d: Date) => enPeru(d).toISOString().slice(0, 10);
    const horaPeru = (d: Date) => enPeru(d).toISOString().slice(11, 16);

    const intervalos = await this.zoomRepository.getIntervalosSala(source);

    // Agrupar intervalos por sala.
    const porSala = new Map<number, typeof intervalos>();
    for (const it of intervalos) {
      const arr = porSala.get(it.room_id) ?? [];
      arr.push(it);
      porSala.set(it.room_id, arr);
    }

    type Reunion = {
      zoom_meeting_id: string;
      topic: string | null;
      start_time: Date;
      fin: Date;
    };

    type Episodio = {
      room_id: number;
      room_name: string | null;
      room_email: string | null;
      fecha: string; // YYYY-MM-DD hora Peru
      inicio: Date; // inicio del choque
      fin: Date; // fin del choque
      maxSimultaneas: number;
      reuniones: Reunion[];
    };

    const episodios: Episodio[] = [];

    for (const [room_id, items] of porSala) {
      const room_name = items[0]?.room_name ?? null;
      const room_email = items[0]?.room_email ?? null;

      // Eventos: +1 al iniciar, -1 al finalizar (fin = inicio + duracion minutos).
      const eventos = items.flatMap((it) => {
        const inicio = new Date(it.start_time).getTime();
        const fin = inicio + it.duration * 60 * 1000;
        return [
          { t: inicio, delta: 1, it, fin },
          { t: fin, delta: -1, it, fin },
        ];
      });

      // Ordenar por tiempo; ante empate, primero las salidas (-1) para no
      // contar como simultaneo algo que termina justo cuando otro empieza.
      eventos.sort((a, b) => a.t - b.t || a.delta - b.delta);

      // Barrido: detectar cada tramo en que activos >= minSimultaneas.
      const activas = new Set<(typeof items)[number]>();
      let enChoque = false;
      let inicioChoque = 0;
      let maxChoque = 0;
      let reunionesChoque = new Map<string, Reunion>();

      const registrarActivas = () => {
        for (const it of activas) {
          reunionesChoque.set(it.zoom_meeting_id, {
            zoom_meeting_id: it.zoom_meeting_id,
            topic: it.topic,
            start_time: new Date(it.start_time),
            fin: new Date(
              new Date(it.start_time).getTime() + it.duration * 60 * 1000,
            ),
          });
        }
      };

      for (const ev of eventos) {
        if (ev.delta === 1) activas.add(ev.it);
        else activas.delete(ev.it);

        const activos = activas.size;

        if (activos >= minSimultaneas && !enChoque) {
          enChoque = true;
          inicioChoque = ev.t;
          maxChoque = activos;
          reunionesChoque = new Map();
          registrarActivas();
        } else if (enChoque && activos >= minSimultaneas) {
          maxChoque = Math.max(maxChoque, activos);
          registrarActivas();
        } else if (enChoque && activos < minSimultaneas) {
          // Fin del choque.
          const inicio = new Date(inicioChoque);
          episodios.push({
            room_id,
            room_name,
            room_email,
            fecha: fechaPeru(inicio),
            inicio,
            fin: new Date(ev.t),
            maxSimultaneas: maxChoque,
            reuniones: [...reunionesChoque.values()].sort(
              (a, b) => a.start_time.getTime() - b.start_time.getTime(),
            ),
          });
          enChoque = false;
        }
      }
    }

    // Ordenar cronologicamente.
    episodios.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

    console.log(
      `[${source}] Choques de >= ${minSimultaneas} reuniones simultaneas: ${episodios.length}`,
    );
    for (const e of episodios) {
      console.log(
        `  ${e.fecha} ${horaPeru(e.inicio)}-${horaPeru(e.fin)} | ${e.room_name ?? e.room_id} (${e.room_email ?? "-"}) | ${e.maxSimultaneas} simultaneas`,
      );
      for (const m of e.reuniones) {
        console.log(
          `      - ${horaPeru(m.start_time)} a ${horaPeru(m.fin)} | ${m.topic ?? m.zoom_meeting_id}`,
        );
      }
    }

    return episodios;
  }

  // ===================================================================================
  async sincronizarInstancias() {
    const meetingRooms = await this.zoomRepository.getMeetings();

    const instances: Partial<Zoom_MeetingInstance>[] = [];

    for (const mr of meetingRooms) {
      console.log("mr => ", mr);

      const res = await this.zoomHttp.getMeetingInstances(mr.zoom_meeting_id);

      instances.push(
        ...res.meetings.map((m) => ({
          uuid: m.uuid,
          start_time: m.start_time ? new Date(m.start_time) : null,
          meeting_id: mr.id,
        })),
      );
    }

    await this.zoomRepository.upsertZoomMeetingInstances(instances);
    return instances;
  }

  // ===================================================================================
  async sincronizarParticipantesRaw() {
    const instances = await this.zoomRepository.getInstances({
      participantsSynced: false,
    });
    const rooms = (
      await this.zoomRepository.getZoomUsers({ role: "host" })
    ).map((z) => z.zoom_user_id);

    for (const instance of instances) {
      try {
        let nextPageToken: string | undefined = undefined;
        const participants = [];

        do {
          const res = await this.zoomHttp.getMeetingReportDetailParticipants(
            instance.uuid,
            nextPageToken,
          );

          participants.push(...(res.participants ?? []));

          nextPageToken = res.next_page_token;
        } while (nextPageToken);

        const rows = participants.map((p) => ({
          instance_id: instance.id,

          participant_id: p.id ?? null,
          participant_user_id: p.participant_user_id ?? null,
          user_id: p.user_id ?? null,

          name: p.name ?? null,
          email: p.user_email ?? null,

          joinTime: p.join_time ? new Date(p.join_time) : null,
          leaveTime: p.leave_time ? new Date(p.leave_time) : null,
          duration: p.duration ?? null,

          status: p.status ?? null,
        }));

        if (rows.length > 0) {
          await this.zoomRepository.insertZoomMeetingParticipantRaw(rows);
        }

        const tieneHost = participants.some((p) => rooms.includes(p.id ?? ""));

        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            participantsSynced: true,
            updated_at: new Date(),
            ...(tieneHost ? {} : { attendance_status: "SIN_SALA" }),
          },
        ]);
      } catch (error) {
        console.error(
          `Error sincronizando participants instance ${instance.id}`,
          error,
        );
      }
    }

    return true;
  }

  // ===================================================================================
  normalizarNombre = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");

  // ===================================================================================
  palabrasDebiles = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y"]);

  // ===================================================================================
  obtenerPalabrasNombre = (value: string) =>
    this.normalizarNombre(value)
      .split(" ")
      .filter((palabra) => palabra.length >= 3)
      .filter((palabra) => !this.palabrasDebiles.has(palabra));

  // ===================================================================================
  levenshtein = (a: string, b: string) => {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => {
        if (i === 0) return j;
        if (j === 0) return i;
        return 0;
      }),
    );

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const costo = a[i - 1] === b[j - 1] ? 0 : 1;

        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j - 1]! + costo,
        );
      }
    }

    return matrix[a.length]![b.length];
  };

  // ===================================================================================
  similitudPalabra = (a: string, b: string) => {
    if (a === b) return 1;

    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 0;

    const distancia = this.levenshtein(a, b);

    return 1 - distancia! / maxLength;
  };

  // ===================================================================================
  calcularSimilitudNombre = (nombreZoom: string, nombreSigu: string) => {
    const palabrasZoom = this.obtenerPalabrasNombre(nombreZoom);
    const palabrasSigu = this.obtenerPalabrasNombre(nombreSigu);

    if (palabrasZoom.length < 2 || palabrasSigu.length < 2) {
      return {
        porcentaje: 0,
        coincidencias: [],
        palabrasZoom,
        palabrasSigu,
      };
    }

    const coincidencias = palabrasZoom.filter((palabraZoom) => {
      return palabrasSigu.some((palabraSigu) => {
        const score = this.similitudPalabra(palabraZoom, palabraSigu);

        return score >= 0.82;
      });
    });

    const porcentaje = coincidencias.length / palabrasZoom.length;

    return {
      porcentaje,
      coincidencias,
      palabrasZoom,
      palabrasSigu,
    };
  };

  // ===================================================================================
  extraerCorreo = (value?: string | null) => {
    if (!value) return null;

    const match = value
      .trim()
      .toLowerCase()
      .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);

    return match?.[0] ?? null;
  };

  // ===================================================================================
  async sincronizarParticipantes() {
    const config = await this.zoomRepository.getAttendanceConfig();
    const gapMs = config.gap * 60 * 1000;
    const rooms = (
      await this.zoomRepository.getZoomUsers({ role: "host" })
    ).map((z) => z.zoom_user_id);

    const instances = await this.zoomRepository.getInstances({
      participantsProcessed: false,
      participantsSynced: true,
      attendance_status: "PENDING",
    }); //.filter((i) => [945].includes(i.id)); //.filter((i) => [118].includes(i.meeting_id));

    for (const instance of instances) {
      const raw = await this.zoomRepository.getZoomMeetingParticipantRaw(
        instance.id,
      );

      const matriculados = await this.zoomRepository.getMatriculadosCourseid(
        instance.courseid,
      );

      const map = new Map<string, any[]>();

      for (const p of raw) {
        const key =
          p.email?.trim().toLowerCase() ||
          p.name?.trim().toUpperCase() ||
          `unknown_${p.user_id ?? Math.random()}`;

        if (!map.has(key)) {
          map.set(key, []);
        }

        const arr = map.get(key)!;
        arr.push(p);
      }

      const procesados: Partial<Zoom_MeetingParticipant>[] = [];

      //===================================================================
      for (const [, sesiones] of map.entries()) {
        sesiones.sort(
          (a, b) =>
            new Date(a.join_time).getTime() - new Date(b.join_time).getTime(),
        );

        let actual: any = null;

        const bloques: {
          join: Date;
          leave: Date;
          duration: number;
        }[] = [];

        for (const s of sesiones) {
          const join = new Date(s.join_time);
          const leave = new Date(s.leave_time);

          if (!actual) {
            actual = { ...s };
            continue;
          }

          const gap = join.getTime() - new Date(actual.leave_time).getTime();

          const overlap =
            join.getTime() <= new Date(actual.leave_time).getTime();

          if (gap <= gapMs || overlap) {
            // 🔗 merge
            actual.leave_time = new Date(
              Math.max(leave.getTime(), new Date(actual.leave_time).getTime()),
            );
          } else {
            // 🔹 guardar bloque
            const start = new Date(actual.join_time);
            const end = new Date(actual.leave_time);

            bloques.push({
              join: start,
              leave: end,
              duration: (end.getTime() - start.getTime()) / 1000,
            });

            actual = { ...s };
          }
        }

        if (actual) {
          const start = new Date(actual.join_time);
          const end = new Date(actual.leave_time);

          bloques.push({
            join: start,
            leave: end,
            duration: (end.getTime() - start.getTime()) / 1000,
          });
        }

        const firstJoin = bloques[0]?.join ?? null;
        const lastLeave = bloques[bloques.length - 1]?.leave ?? null;
        const totalDuration = bloques.reduce((sum, b) => sum + b.duration, 0);

        procesados.push({
          instance_id: instance.id,
          zoomUser_id: sesiones[0].participant_id ?? null,
          name: sesiones[0].name ?? null,
          email: sesiones[0].email ?? null,
          firstJoin,
          lastLeave,
          duration: totalDuration,
          sessions: bloques,
          attendance: null,
          late: null,
        });
      }

      //===================================================================

      //Procesar host
      const host = procesados.find((pr) =>
        rooms.includes(pr.zoomUser_id ?? ""),
      );

      if (!host) {
        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            participantsProcessed: true,
            updated_at: new Date(),
            attendance_status: "SIN_SALA",
          },
        ]);
        continue;
      }

      const sessions = host?.sessions ?? [];
      const start_time = sessions[0]?.join;
      const end_time = sessions[sessions.length - 1]?.leave;
      const duration = sessions.reduce((sum, s) => sum + s.duration, 0);
      host.role = "host";

      // Dia y hora civiles de Lima, derivados del offset fijo y no del TZ del
      // proceso, para que el resultado sea el mismo corriendo en UTC.
      const n_numdia = start_time ? diaSemanaLima(start_time) : null;
      const minutosInicio = start_time ? minutosDiaLima(start_time) : null;

      const dataGrupos =
        n_numdia === null
          ? []
          : await this.zoomRepository.getHorarioGrupo(
              instance.courseid,
              n_numdia,
            );

      // La sala de Zoom es una cuenta compartida, asi que el host no identifica
      // al docente: se deduce del bloque horario en que arranco la reunion.
      const docentesBloque =
        minutosInicio === null
          ? []
          : docentesDelBloque({ slots: dataGrupos, minutos: minutosInicio });

      const docenteDni = docentesBloque[0] ?? null;

      if (docentesBloque.length > 1) {
        console.warn(
          `Instance ${instance.id} con docente ambiguo: el bloque de ` +
            `${horaMinLima(start_time!)} lo dictan ${docentesBloque.join(", ")}. ` +
            `Se usa ${docenteDni}.`,
        );
      } else if (!docentesBloque.length) {
        console.warn(
          `Instance ${instance.id} no cae en ningun bloque del horario ` +
            `(courseid ${instance.courseid}, dia ${n_numdia}, ${minutosInicio} min)`,
        );
      }

      host.c_dnidoc = docenteDni;

      // Grupos de la clase: el bloque horario del docente elegido, no todo lo
      // que se dicta ese dia. Sin este recorte una reunion de 18:50-20:30
      // marcaba como "corresponde" a alumnos de grupos que solo tienen clase
      // 17:10-18:50. Tiene que dar lo mismo que subirAsistencia, que arma las
      // sesiones con el mismo criterio.
      const slotsDelBloque =
        minutosInicio === null || !docenteDni
          ? []
          : resolverGruposSesion({
              slots: dataGrupos.filter((s) => s.c_dnidoc === docenteDni),
              minutos: minutosInicio,
            });

      const a_c_grpcur = gruposDeSlots(slotsDelBloque);
      console.log("a_c_grpcur => ", a_c_grpcur);

      // Referencia de la tardanza: la hora en que la clase DEBIA empezar segun
      // el horario, no cuando el docente abrio la sala. Si la reunion no cae en
      // ningun bloque no hay hora programada y se cae a la apertura de la sala.
      const inicioProgramado =
        slotsDelBloque[0] && start_time
          ? inicioProgramadoSlot(slotsDelBloque[0], start_time)
          : null;

      const referenciaTardanza = inicioProgramado ?? start_time ?? null;

      console.log(
        "referencia tardanza => ",
        inicioProgramado
          ? `${horaMinLima(inicioProgramado)} (horario)`
          : `${start_time ? horaMinLima(start_time) : "?"} (apertura de sala, sin bloque)`,
      );

      for (const procesado of procesados) {
        if (procesado.role === "host") continue;

        const correoZoom =
          this.extraerCorreo(procesado.email) ??
          this.extraerCorreo(procesado.name);

        let matriculado = matriculados.find((m) => {
          if (!correoZoom || !m.c_email_institucional) return false;

          return correoZoom === m.c_email_institucional.trim().toLowerCase();
        });

        if (!matriculado && procesado.name) {
          const candidatos = matriculados
            .map((m) => {
              if (!m.nombre) return null;

              const resultado = this.calcularSimilitudNombre(
                procesado.name!,
                m.nombre,
              );

              return {
                matriculado: m,
                porcentaje: resultado.porcentaje,
                coincidencias: resultado.coincidencias,
                palabrasZoom: resultado.palabrasZoom,
                palabrasSigu: resultado.palabrasSigu,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .filter((item) => item.porcentaje >= 0.75)
            .sort((a, b) => b.porcentaje - a.porcentaje);

          const mejor = candidatos[0];
          const segundo = candidatos[1];

          if (
            mejor &&
            (!segundo || mejor.porcentaje - segundo.porcentaje >= 0.15)
          ) {
            matriculado = mejor.matriculado;
          } else {
            console.warn(
              "No se asignó alumno por coincidencia ambigua o baja",
              {
                zoom: procesado.name,
                candidatos: candidatos.slice(0, 5).map((c) => ({
                  c_codalu: c.matriculado.c_codalu,
                  nombre: c.matriculado.nombre,
                  porcentaje: c.porcentaje,
                  coincidencias: c.coincidencias,
                })),
              },
            );
          }
        }

        procesado.c_codalu = matriculado?.c_codalu
          ? String(matriculado.c_codalu)
          : null;
        procesado.c_codfac = matriculado?.c_codfac ?? null;
        procesado.c_codesp = matriculado?.c_codesp ?? null;
        procesado.c_codmod = matriculado?.c_codmod
          ? String(matriculado.c_codmod)
          : null;
        procesado.c_grpcur = matriculado?.c_grpcur ?? null;
        procesado.corresponde_sesion = a_c_grpcur.includes(
          matriculado?.c_grpcur ?? "",
        );

        procesado.role = "student";
        // Attendance
        if (start_time && end_time && procesado.duration != null) {
          const meetingDuration =
            (end_time.getTime() - start_time.getTime()) / 1000; // en segundos
          const percentage = procesado.duration / meetingDuration;
          procesado.attendance = percentage >= config.minAttendancePercentage;
        } else {
          procesado.attendance = false;
        }

        // Late: contra la hora programada del bloque, no la apertura de la sala.
        procesado.late = esTardanza({
          firstJoin: procesado.firstJoin,
          referencia: referenciaTardanza,
          toleranciaMin: config.lateToleranceMinutes,
        });
      }

      const fechaClase = start_time
        ? [
            start_time.getFullYear(),
            String(start_time.getMonth() + 1).padStart(2, "0"),
            String(start_time.getDate()).padStart(2, "0"),
          ].join("-")
        : null;

      if (!fechaClase) {
        throw new Error("No se pudo obtener la fecha de inicio de la clase.");
      }

      const procesadosFinal = Array.from(
        procesados
          .reduce((map, p) => {
            const isHost = p.role === "host";

            const key = isHost
              ? `host-${p.zoomUser_id ?? p.name ?? "unknown"}`
              : p.c_codalu
                ? `student-${p.c_codalu}`
                : `unmatched-${p.zoomUser_id ?? p.email ?? p.name ?? Math.random()}`;

            const actual = map.get(key);
            const sesionesActuales = Array.isArray(p.sessions)
              ? p.sessions
              : [];

            if (!actual) {
              map.set(key, {
                ...p,
                duration: Number(p.duration ?? 0),
                sessions: sesionesActuales,
              });

              return map;
            }

            const firstJoinActual = actual.firstJoin
              ? new Date(actual.firstJoin)
              : null;
            const firstJoinNuevo = p.firstJoin ? new Date(p.firstJoin) : null;

            const lastLeaveActual = actual.lastLeave
              ? new Date(actual.lastLeave)
              : null;
            const lastLeaveNuevo = p.lastLeave ? new Date(p.lastLeave) : null;

            actual.duration =
              Number(actual.duration ?? 0) + Number(p.duration ?? 0);

            if (
              firstJoinNuevo &&
              (!firstJoinActual || firstJoinNuevo < firstJoinActual)
            ) {
              actual.firstJoin = firstJoinNuevo;
            }

            if (
              lastLeaveNuevo &&
              (!lastLeaveActual || lastLeaveNuevo > lastLeaveActual)
            ) {
              actual.lastLeave = lastLeaveNuevo;
            }

            actual.sessions = [
              ...(Array.isArray(actual.sessions) ? actual.sessions : []),
              ...sesionesActuales,
            ].sort(
              (a, b) => new Date(a.join).getTime() - new Date(b.join).getTime(),
            );

            actual.c_codalu = actual.c_codalu ?? p.c_codalu ?? null;
            actual.c_codfac = actual.c_codfac ?? p.c_codfac ?? null;
            actual.c_codesp = actual.c_codesp ?? p.c_codesp ?? null;
            actual.c_codmod = actual.c_codmod ?? p.c_codmod ?? null;
            actual.c_grpcur = actual.c_grpcur ?? p.c_grpcur ?? null;

            actual.corresponde_sesion =
              Number(actual.corresponde_sesion ?? 0) === 1 ||
              Number(p.corresponde_sesion ?? 0) === 1;

            return map;
          }, new Map<string, Partial<Zoom_MeetingParticipant>>())
          .values(),
      );

      for (const procesado of procesadosFinal) {
        if (procesado.role === "host") continue;

        if (start_time && end_time && procesado.duration != null) {
          const meetingDuration =
            (end_time.getTime() - start_time.getTime()) / 1000;

          const percentage = Number(procesado.duration) / meetingDuration;

          procesado.attendance = percentage >= config.minAttendancePercentage;
        } else {
          procesado.attendance = false;
        }

        procesado.late = esTardanza({
          firstJoin: procesado.firstJoin,
          referencia: referenciaTardanza,
          toleranciaMin: config.lateToleranceMinutes,
        });
      }

      await this.zoomRepository.insertZoomMeetingParticipants(procesadosFinal);

      // await this.zoomRepository.insertZoomMeetingParticipants(procesados);
      const cantidad = await this.zoomRepository.getMatriculadosCantindad(
        instance.courseid,
        fechaClase,
      );

      await this.zoomRepository.upsertZoomMeetingInstances([
        {
          uuid: instance.uuid,
          meeting_id: instance.meeting_id,
          start_time: start_time ? new Date(start_time) : null,
          end_time: end_time ? new Date(end_time) : null,
          duration,
          participantsProcessed: true,
          updated_at: new Date(),
          total_participantes: procesadosFinal.filter((p) => p.role !== "host")
            .length,
          total_matriculados: cantidad.cantidad,
          attendance_status:
            duration < config.minTime * 60
              ? "SKIPPED_SHORT_INSTANCE"
              : instance.attendance_status,
        },
      ]);
    }

    return true;
  }

  // ===================================================================================
  async sincronizarAsistencias(periodo?: number) {
    console.log("inicio asistencia", periodo ? `periodo ${periodo}` : "todos");

    const tbCursoGrupoSincro =
      await this.zoomRepository.getTbCursoGrupoSincro();

    const periodoPorCourseid = new Map(
      tbCursoGrupoSincro.map((c) => [Number(c.courseid), Number(c.n_codper)]),
    );

    let instances = await this.zoomRepository.getInstances({
      participantsProcessed: true,
      participantsSynced: true,
      attendance_status: "PENDING",
    });

    if (periodo) {
      instances = instances.filter(
        (i) =>
          i.courseid != null &&
          periodoPorCourseid.get(Number(i.courseid)) === periodo,
      );
    }

    for (const instance of instances) {
      if (!instance.courseid) {
        console.warn(`Instance ${instance.id} sin courseid, skipeando`);
        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            attendance_status: "SIN_COURSEID",
            updated_at: new Date(),
          },
        ]);
        continue;
      }

      const cursoGrupo = tbCursoGrupoSincro.find(
        (item) => Number(item.courseid) === Number(instance.courseid),
      );
      const facultadesPermitidas = ["E", "S"];

      if (!cursoGrupo) {
        console.warn(
          `Instance ${instance.id} con courseid ${instance.courseid} no existe en tb_curso_grupo_sincro`,
        );

        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            attendance_status: "SIN_COURSEID",
            updated_at: new Date(),
          },
        ]);

        continue;
      }

      if (!facultadesPermitidas.includes(cursoGrupo.c_codfac)) {
        console.warn(
          `Instance ${instance.id} omitida. Courseid ${instance.courseid} pertenece a facultad ${cursoGrupo.c_codfac}`,
        );

        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            attendance_status: "SKIPPED_FACULTAD_NO_PERMITIDA",
            updated_at: new Date(),
          },
        ]);

        continue;
      }

      if (!instance.start_time) {
        console.warn(`Instance ${instance.id} sin start_time, skipeando`);
        continue;
      }

      const d_fecha = fechaLima(instance.start_time);
      const minutosInicio = minutosDiaLima(instance.start_time);
      const diaTexto = diaTextoLima(instance.start_time);
      const horaInicio = horaMinLima(instance.start_time);

      console.log("====================================");
      console.log("instacia.id => ", instance.id);
      console.log("courseid => ", instance.courseid);
      console.log("inicio (Lima) => ", `${d_fecha} ${horaInicio}`);

      const dniDocente = await this.zoomRepository.getDocenteParticipantes(
        instance.id,
      );

      if (!dniDocente?.c_dnidoc) {
        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            attendance_status: "SIN_DNIDOCENTE",
            updated_at: new Date(),
          },
        ]);
        console.log("sin docente detectado");
        continue;
      }

      const horarioDocente = await this.zoomRepository.getHorarioGrupo(
        instance.courseid,
        diaSemanaLima(instance.start_time),
        dniDocente.c_dnidoc,
      );

      // Recorte clave: de todo lo que el docente dicta ese dia, solo el bloque
      // horario en que arranco la reunion. Antes se creaba una sesion por cada
      // grupo del dia, asi que una practica de 18:50-20:30 de N1 generaba
      // tambien la sesion de N2, que solo tiene clase 17:10-18:50.
      const sesionGrupo = resolverGruposSesion({
        slots: horarioDocente,
        minutos: minutosInicio,
      });

      if (!sesionGrupo.length) {
        console.warn(
          `Instance ${instance.id} no cae en ningun bloque del horario ` +
            `(courseid ${instance.courseid}, ${d_fecha} ${horaInicio}, doc. ${dniDocente.c_dnidoc}). ` +
            `No se crean sesiones.`,
        );
        continue;
      }

      const gruposBloque = gruposDeSlots(sesionGrupo);
      const claveBloque = claveVentana(sesionGrupo[0]!);
      console.log("grupos del bloque => ", gruposBloque, claveBloque);

      // Dedupe por grupo Y bloque, no por dia. Dos instancias de la misma clase
      // (el docente cerro y volvio a abrir la sala) no deben duplicar la sesion,
      // pero la teoria y la practica del mismo grupo el mismo dia son clases
      // distintas y cada una lleva la suya. tb_asis_alum no tiene columna de
      // hora, asi que el bloque de una sesion existente se deduce de la hora que
      // quedo en su c_tema.
      const existentes: any[] = await this.zoomRepository.sesionExistente(
        instance.courseid,
        d_fecha,
        dniDocente.c_dnidoc,
      );

      const idsDelBloque = new Map<string, number>();

      for (const s of existentes ?? []) {
        const grupo = String(s.c_grpcur).trim();
        if (!gruposBloque.includes(grupo)) continue;

        const claveExistente = claveBloqueDeTema(s.c_tema, horarioDocente);

        if (claveExistente === null) {
          // Sesion sin hora en el tema (cargada a mano): no se puede ubicar en
          // un bloque, se respeta y no se duplica.
          console.warn(
            `Sesion ${s.id_asistencia} (${grupo}, ${d_fecha}) sin hora en c_tema; ` +
              `se asume que cubre este bloque.`,
          );
        } else if (claveExistente !== claveBloque) {
          continue;
        }

        idsDelBloque.set(grupo, s.id_asistencia);
      }

      // Una fila por grupo: tb_asis_alum no tiene unique key (el ON DUPLICATE KEY
      // de createSesiones solo cubre la PK autoincremental), asi que dos slots
      // del mismo grupo en la misma ventana insertarian la sesion dos veces.
      const porGrupo = new Map<string, (typeof sesionGrupo)[number]>();
      for (const s of sesionGrupo) {
        const grupo = String(s.c_grpcur).trim();
        if (!idsDelBloque.has(grupo) && !porGrupo.has(grupo)) {
          porGrupo.set(grupo, s);
        }
      }

      const faltantes = [...porGrupo.values()];

      if (!faltantes.length) {
        await this.zoomRepository.upsertZoomMeetingInstances([
          {
            uuid: instance.uuid,
            meeting_id: instance.meeting_id,
            attendance_status: "ALREADY_EXISTS",
            id_asistencia: [...idsDelBloque.values()].join(","),
            updated_at: new Date(),
          },
        ]);
        continue;
      }

      const dataSesiones = faltantes.map((s) => ({
        n_codper: s.n_codper,
        c_codmod: s.c_codmod,
        c_codfac: s.c_codfac,
        c_codesp: s.c_codesp,
        c_codcur: s.c_codcur,
        c_grpcur: s.c_grpcur,
        c_dnidoc: s.c_dnidoc,
        d_fecha: d_fecha,
        d_fecha_registro: d_fecha,
        c_tema:
          `[AUTO] ${instance.topic?.trim() || `${s.c_codcur}-${s.c_grpcur}`} (${diaTexto} ${d_fecha} ${horaInicio} - Doc. ${dniDocente.c_dnidoc})`.slice(
            0,
            150,
          ),
        n_codpla: s.n_codpla,
        c_user_upd: "boot.v2",
        d_fecha_upd: new Date(),
      }));
      console.log("dataSesiones => ", dataSesiones);

      const sesionesCreadas =
        await this.zoomRepository.createSesiones(dataSesiones);
      console.log("sesionesCreadas => ", sesionesCreadas);

      // Solo las sesiones de este bloque: si el grupo tambien tuvo otra clase
      // hoy con el mismo docente (teoria y practica), sus alumnos no deben
      // colgarse de la sesion equivocada.
      const sesiones = (
        await this.zoomRepository.getSesiones(
          instance.courseid,
          d_fecha,
          dniDocente.c_dnidoc,
        )
      ).filter((s) => {
        if (!gruposBloque.includes(String(s.c_grpcur).trim())) return false;
        const clave = claveBloqueDeTema(s.c_tema, horarioDocente);
        return clave === null || clave === claveBloque;
      });

      const participantes = await this.zoomRepository.getZoomMeetingParticipant(
        instance.id,
      );

      const part = participantes
        .filter(
          (p) =>
            Number(p.corresponde_sesion) === 1 && Number(p.attendance) === 1,
        )
        .map((p) => {
          const sesion = sesiones.find(
            (s) =>
              String(s.c_codesp) === String(p.c_codesp) &&
              String(s.c_codmod) === String(p.c_codmod) &&
              String(s.c_grpcur) === String(p.c_grpcur),
          );

          if (!sesion?.id_asistencia) {
            return null;
          }

          return {
            id_asistencia: sesion.id_asistencia,
            c_codalu: p.c_codalu!,
            c_estado: p.late ? "T" : "A",
            seguir: new Date(),
          };
        })
        .filter((p) => p !== null);

      console.log("part => ", part);

      const createSesionDetalle =
        await this.zoomRepository.createAsistenciaDetalles(part);

      console.log("====================================");
      await this.zoomRepository.upsertZoomMeetingInstances([
        {
          uuid: instance.uuid,
          meeting_id: instance.meeting_id,
          updated_at: new Date(),
          attendance_status: "UPLOADED",
          // Trazabilidad: hasta ahora solo se guardaba en el camino
          // ALREADY_EXISTS, asi que las instancias subidas no dejaban rastro de
          // que sesion de SIGU habian alimentado.
          id_asistencia: sesiones.map((s) => s.id_asistencia).join(","),
        },
      ]);
    }
    return true;
  }
}
