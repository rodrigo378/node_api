import { Knex } from "knex";
import { DbRegistry } from "../../core/db/registry";
import { DbName } from "../../core/const/db.const";
import {
  UpsertZoomUserInput,
  Zoom_AttendanceConfig,
  Zoom_Meeting,
  Zoom_MeetingInstance,
  Zoom_MeetingOccurrence,
  Zoom_MeetingParticipant,
  Zoom_MeetingParticipantRaw,
  Zoom_User,
} from "./types/db.types";

export class ZoomRepository {
  constructor(private readonly registry: DbRegistry) {}

  private db(dbName: DbName): Knex {
    return this.registry.get(dbName);
  }

  async getZoomUsers(filters: { active?: boolean; role?: string }) {
    const db = this.db("API_2");
    const query = db("zoom_user");

    if (filters.active !== undefined) {
      query.where("active", filters.active);
    }

    if (filters.role !== undefined) {
      query.where("role", filters.role);
    }

    return (await query) as Zoom_User[];
  }

  async getCourseIdsByShortnames(shortnames: string[]) {
    const [rows] = await this.db("SIGU_LECTURA").raw(
      `
    SELECT DISTINCT shortname, courseid
    FROM tb_curso_grupo_sincro
    WHERE shortname IN (?)
    `,
      [shortnames],
    );

    return rows as { shortname: string; courseid: number }[];
  }

  async getMeetings() {
    const [rows] = await this.db("API_2").raw(
      `
      SELECT *
      FROM zoom_meeting
      `,
    );

    return rows as Zoom_Meeting[];
  }

  // Intervalos (sala + inicio + duracion) para detectar reuniones simultaneas.
  // source: "instance" = lo que ocurrio, "occurrence" = lo programado.
  async getIntervalosSala(source: "instance" | "occurrence") {
    const table =
      source === "instance"
        ? "zoom_meeting_instance"
        : "zoom_meeting_occurrence";

    const rows = await this.db("API_2")(`${table} as t`)
      .join("zoom_meeting as m", "t.meeting_id", "m.id")
      .join("zoom_user as u", "m.room_id", "u.id")
      .whereNotNull("t.start_time")
      .whereNotNull("t.duration")
      .select(
        "m.room_id as room_id",
        "u.display_name as room_name",
        "u.email as room_email",
        "m.zoom_meeting_id as zoom_meeting_id",
        "m.topic as topic",
        "t.start_time as start_time",
        "t.duration as duration",
      );

    return rows as {
      room_id: number;
      room_name: string | null;
      room_email: string | null;
      zoom_meeting_id: string;
      topic: string | null;
      start_time: Date;
      duration: number;
    }[];
  }

  async getTbCursoGrupoSincro() {
    const [rows] = await this.db("SIGU_LECTURA").raw(
      `
      SELECT * FROM tb_curso_grupo_sincro
      
      `,
    );

    return rows as { courseid: number; c_codfac: string; n_codper: number }[];
  }

  async getAttendanceConfig() {
    const [rows] = await this.db("API_2").raw(
      `SELECT * FROM zoom_attendance_config LIMIT 1`,
    );

    return rows[0] as Zoom_AttendanceConfig;
  }

  async getInstances(filters: {
    participantsSynced?: boolean;
    participantsProcessed?: boolean;
    attendance_status?: "PENDING" | "UPLOADED" | "ALREADY_EXISTS";
  }) {
    const db = this.db("API_2");

    const query = db("zoom_meeting_instance")
      .join(
        "zoom_meeting",
        "zoom_meeting_instance.meeting_id",
        "zoom_meeting.id",
      )
      .select(
        "zoom_meeting_instance.*",
        "zoom_meeting.shortname",
        "zoom_meeting.courseid",
      );

    if (filters.participantsSynced !== undefined) {
      query.where("participantsSynced", filters.participantsSynced);
    }

    if (filters.participantsProcessed !== undefined) {
      query.where("participantsProcessed", filters.participantsProcessed);
    }

    if (filters.attendance_status !== undefined) {
      query.where("attendance_status", filters.attendance_status);
    }
    // return (await query) as Zoom_MeetingInstance[];
    return query;
  }

  async getZoomMeetingParticipantRaw(instance_id: number) {
    const [row] = await this.db("API_2").raw(
      `
      SELECT * FROM zoom_meeting_participant_raw where instance_id = ?  
    `,
      [instance_id],
    );
    return row as Zoom_MeetingParticipantRaw[];
  }

  async getZoomMeetingParticipant(instance_id: number) {
    const [row] = await this.db("API_2").raw(
      `
      SELECT * FROM zoom_meeting_participants where instance_id = ?  
    `,
      [instance_id],
    );
    return row as Zoom_MeetingParticipant[];
  }

  async getMatriculadosCourseid(courseid: number) {
    const [row] = await this.db("SIGU_LECTURA").raw(
      `
        SELECT DISTINCT
          s.courseid,
          a.c_codalu,
          b.c_email_institucional,
          GROUP_CONCAT(c.nombres, ' ', c.paterno, ' ', c.materno) AS nombre,
          a.c_codcur,
          a.c_grpcur,
          a.n_codper,
          a.n_codpla,
          a.c_codfac_alu as c_codfac,
          a.c_codesp_alu as c_codesp,
          a.c_codmod
        FROM
          tb_alu_cur_grp a
          INNER JOIN tb_ficha_perso_alu b ON a.c_codalu = b.c_codalu
          INNER JOIN alumno c ON a.c_codalu = c.codigo
          AND a.c_codesp = c.c_codesp
          INNER JOIN tb_curso_grupo_sincro s ON a.n_codper = s.n_codper
          AND a.c_codcur = s.c_codcur
          AND a.n_codpla = s.n_codpla
          AND a.c_grpcur = s.c_grpcur
          AND a.c_codfac_alu = s.c_codfac
          AND a.c_codesp_alu = s.c_codesp
          AND a.c_codmod = s.c_codmod
        WHERE
          a.c_codfac_alu IN ('E', 'S')
          AND a.c_codalu NOT IN (2119921, 12345678)
          AND s.courseid = ?
        GROUP BY
          a.c_codalu,
          b.c_email_institucional,
          s.courseid,
          a.c_codcur,
          a.n_codper,
          a.c_estado,
          a.c_codfac_alu,
          a.c_codesp_alu,
          a.c_grpcur,
          a.n_codpla,
          a.c_codmod;
    `,
      [courseid],
    );

    return row as {
      courseid: number;
      c_codalu: number;
      c_email_institucional: string;
      nombre: string;
      c_codcur: string;
      c_grpcur: string;
      n_codper: number;
      n_codpla: number;
      c_codfac: string;
      c_codesp: string;
      c_codmod: number;
    }[];
  }

  async getDocentes(courseid: number, n_numdia: number) {
    const [row] = await this.db("SIGU_LECTURA").raw(
      `
        SELECT 
          DISTINCT
            a.c_dnidoc,
            a.n_numdia,
            a.c_hh_ini
        FROM
            tb_cur_grp_hor a
                INNER JOIN
            tb_curso_grupo_sincro b ON a.n_codper = b.n_codper
                AND a.c_codesp = b.c_codesp
                AND a.c_codmod = b.c_codmod
                AND a.n_codpla = b.n_codpla
                AND a.c_grpcur = b.c_grpcur
                AND a.c_codcur = b.c_codcur
        WHERE
            b.courseid = ?
            and a.n_numdia = ?
            and c_tipo in ("VIR","TEV", "TEO")
    `,
      [courseid, n_numdia],
    );

    return row as { c_dnidoc: string; n_numdia: number; c_hh_ini: number }[];
  }

  async getDocenteParticipantes(instance_id: number) {
    const [row] = await this.db("API_2").raw(
      `
      SELECT * FROM zoom_meeting_participants 
      WHERE instance_id = ? AND role = 'host'
      LIMIT 1
    `,
      [instance_id],
    );

    return row[0] as Zoom_MeetingParticipant | undefined;
  }

  async sesionExistente(courseid: number, d_fecha: string, c_dnidoc: string) {
    const [row] = await this.db("SIGU_LECTURA").raw(
      `
      SELECT 
          a.*
      FROM
          tb_asis_alum a
              INNER JOIN
          tb_curso_grupo_sincro b ON a.n_codper = b.n_codper
              AND a.c_codesp = b.c_codesp
              AND a.c_codmod = b.c_codmod
              AND a.n_codpla = b.n_codpla
              AND a.c_grpcur = b.c_grpcur
              AND a.c_codcur = b.c_codcur
      WHERE
          b.courseid = ?
              AND DATE(d_fecha) = ?
              ${c_dnidoc ? "AND a.c_dnidoc = ?" : ""}
      ORDER BY id_asistencia;
    `,
      c_dnidoc ? [courseid, d_fecha, c_dnidoc] : [courseid, d_fecha],
    );
    return row;
  }

  async insertZoomMeetingParticipantRaw(
    participants: Partial<Zoom_MeetingParticipantRaw>[],
  ) {
    if (!participants.length) return;

    const db = this.db("API_2");
    const now = new Date();

    const rows = participants.map((p) => ({
      instance_id: p.instance_id ?? null,

      participant_id: p.participant_id ?? null,
      participant_user_id: p.participant_user_id ?? null,
      user_id: p.user_id ?? null,

      name: p.name ?? null,
      email: p.email ?? null,

      join_time: p.joinTime ?? null,
      leave_time: p.leaveTime ?? null,
      duration: p.duration ?? null,

      status: p.status ?? null,

      created_at: now,
      updated_at: now,
    }));

    await db("zoom_meeting_participant_raw").insert(rows);

    return true;
  }

  async insertZoomMeetingParticipants(
    participants: Partial<Zoom_MeetingParticipant>[],
  ) {
    if (!participants.length) return;

    const db = this.db("API_2");
    const now = new Date();

    const rows = participants.map((p) => ({
      instance_id: p.instance_id ?? null,
      zoom_user_id:
        p.zoomUser_id && p.zoomUser_id.trim() !== "" ? p.zoomUser_id : null,

      name: p.name ?? null,
      email: p.email ?? null,
      role: p.role ?? null,

      c_dnidoc: p.c_dnidoc ?? null,
      c_codalu: p.c_codalu ?? null,
      c_codfac: p.c_codfac ?? null,
      c_codesp: p.c_codesp ?? null,
      c_codmod: p.c_codmod ?? null,
      c_grpcur: p.c_grpcur ?? null,

      first_join: p.firstJoin ?? null,
      last_leave: p.lastLeave ?? null,
      duration: p.duration ?? null,

      sessions: JSON.stringify(p.sessions ?? []),

      attendance: p.attendance ?? null,
      late: p.late ?? null,
      corresponde_sesion: p.corresponde_sesion ?? false,

      created_at: now,
      updated_at: now,
    }));

    await db("zoom_meeting_participants").insert(rows);

    return true;
  }

  async upsertZoomRoom(zoomRooms: UpsertZoomUserInput[]) {
    if (!zoomRooms.length) return true;

    const db = this.db("API_2");
    const now = new Date();

    const rows = zoomRooms.map((room) => ({
      zoom_user_id: room.zoom_user_id ?? null,
      first_name: room.first_name ?? null,
      last_name: room.last_name ?? null,
      display_name: room.display_name ?? null,
      email: room.email ?? null,
      licensed: room.licensed,

      created_at: room.created_at ?? now,
      updated_at: room.updated_at ?? now,
    }));

    await db("zoom_user")
      .insert(rows)
      .onConflict("zoom_user_id")
      .merge({
        zoom_user_id: db.raw("VALUES(zoom_user_id)"),
        first_name: db.raw("VALUES(first_name)"),
        last_name: db.raw("VALUES(last_name)"),
        display_name: db.raw("VALUES(display_name)"),
        email: db.raw("VALUES(email)"),
        licensed: db.raw("VALUES(licensed)"),

        created_at: db.raw("VALUES(created_at)"),
        updated_at: db.raw("VALUES(updated_at)"),
      });

    return true;
  }

  async upsertZoomMeetings(meetings: Partial<Zoom_Meeting>[]) {
    if (!meetings.length) return;

    const db = this.db("API_2");
    const now = new Date();

    const rows = meetings.map((meeting) => ({
      room_id: meeting.room_id ?? null,
      shortname: meeting.shortname ?? null,
      courseid: meeting.courseid ?? null,
      zoom_meeting_id: meeting.zoom_meeting_id ?? null,
      topic: meeting.topic ?? null,
      agenda: meeting.agenda ?? null,
      type: meeting.type ?? null,
      join_url: meeting.joinUrl ?? null,
      start_url: meeting.startUrl ?? null,
      created_at: meeting.createdAt ?? now,
      updated_at: meeting.updatedAt ?? now,
    }));

    await db("zoom_meeting")
      .insert(rows)
      .onConflict("zoom_meeting_id")
      .merge({
        room_id: db.raw("VALUES(room_id)"),
        shortname: db.raw("VALUES(shortname)"),
        courseid: db.raw("VALUES(courseid)"),
        topic: db.raw("VALUES(topic)"),
        agenda: db.raw("VALUES(agenda)"),
        type: db.raw("VALUES(type)"),
        join_url: db.raw("VALUES(join_url)"),
        start_url: db.raw("VALUES(start_url)"),
        updated_at: db.raw("VALUES(updated_at)"),
      });

    return true;
  }

  async upsertZoomMeetingOccurrences(
    occurrences: Partial<Zoom_MeetingOccurrence>[],
  ) {
    if (!occurrences.length) return true;

    const db = this.db("API_2");
    const now = new Date();

    const rows = occurrences.map((oc) => ({
      meeting_id: oc.meeting_id ?? null,
      occurrence_id: oc.occurrence_id ?? null,
      start_time: oc.start_time ?? null,
      duration: oc.duration ?? null,
      status: oc.status ?? null,
      created_at: oc.created_at ?? now,
      updated_at: oc.updated_at ?? now,
    }));

    await db("zoom_meeting_occurrence")
      .insert(rows)
      .onConflict(["meeting_id", "occurrence_id"])
      .merge({
        start_time: db.raw("VALUES(start_time)"),
        duration: db.raw("VALUES(duration)"),
        status: db.raw("VALUES(status)"),
        // deleted: db.raw("VALUES(deleted)"),
        updated_at: db.raw("VALUES(updated_at)"),
      });

    return true;
  }

  async upsertZoomMeetingInstances(instances: Partial<Zoom_MeetingInstance>[]) {
    if (!instances.length) return;

    const db = this.db("API_2");
    const now = new Date();

    const rows = instances.map((i) => ({
      meeting_id: i.meeting_id ?? null,
      occurrence_id: i.occurrence_id ?? null,
      uuid: i.uuid ?? null,
      start_time: i.start_time ?? null,
      end_time: i.end_time ?? null,
      duration: i.duration ?? null,
      status: i.status ?? null,

      participantsSynced: i.participantsSynced,
      participantsProcessed: i.participantsProcessed,
      attendance_status: i.attendance_status,

      total_matriculados: i.total_matriculados ?? null,
      total_participantes: i.total_participantes ?? null,

      id_asistencia: i.id_asistencia ?? null,

      created_at: i.created_at ?? now,
      updated_at: i.updated_at ?? now,
    }));

    const mergeData: Record<string, any> = {
      updated_at: db.raw("VALUES(updated_at)"),
    };

    const has = (key: keyof Zoom_MeetingInstance) =>
      instances.some((i) => i[key] !== undefined);

    if (has("meeting_id")) {
      mergeData.meeting_id = db.raw("VALUES(meeting_id)");
    }

    if (has("occurrence_id")) {
      mergeData.occurrence_id = db.raw("VALUES(occurrence_id)");
    }

    if (has("start_time")) {
      mergeData.start_time = db.raw("VALUES(start_time)");
    }

    if (has("end_time")) {
      mergeData.end_time = db.raw("VALUES(end_time)");
    }

    if (has("duration")) {
      mergeData.duration = db.raw("VALUES(duration)");
    }

    if (has("status")) {
      mergeData.status = db.raw("VALUES(status)");
    }

    if (has("participantsSynced")) {
      mergeData.participantsSynced = db.raw("VALUES(participantsSynced)");
    }

    if (has("participantsProcessed")) {
      mergeData.participantsProcessed = db.raw("VALUES(participantsProcessed)");
    }

    if (has("attendance_status")) {
      mergeData.attendance_status = db.raw("VALUES(attendance_status)");
    }

    if (has("total_matriculados")) {
      mergeData.total_matriculados = db.raw("VALUES(total_matriculados)");
    }

    if (has("total_participantes")) {
      mergeData.total_participantes = db.raw("VALUES(total_participantes)");
    }

    if (has("id_asistencia")) {
      mergeData.id_asistencia = db.raw("VALUES(id_asistencia)");
    }

    await db("zoom_meeting_instance")
      .insert(rows)
      .onConflict("uuid")
      .merge(mergeData);

    return true;
  }

  async getMatriculadosCantindad(courseid: number, d_date: string) {
    const [row] = await this.db("SIGU_LECTURA").raw(
      `
        SELECT
          COUNT(*) as cantidad
        FROM
          tb_alu_cur_grp a
          INNER JOIN tb_curso_grupo_sincro s ON a.n_codper = s.n_codper
          AND a.c_codcur = s.c_codcur
          AND a.n_codpla = s.n_codpla
          AND a.c_grpcur = s.c_grpcur
          AND a.c_codfac_alu = s.c_codfac
          AND a.c_codesp_alu = s.c_codesp
          AND a.c_codmod = s.c_codmod
        WHERE
          s.courseid = ?
          AND a.c_codalu NOT IN (2119921, 12345678)
          AND a.c_estado = "M"
          AND DATE(a.d_date) < ?
  
      `,
      [courseid, d_date],
    );

    return row[0] as { cantidad: number };
  }

  async getHorarioGrupo(
    courseid: number,
    n_numdia: number,
    c_dnidoc?: string | null,
  ) {
    const params: any[] = [courseid, n_numdia];

    let docenteWhere = "";

    if (c_dnidoc?.trim()) {
      docenteWhere = "AND h.c_dnidoc = ?";
      params.push(c_dnidoc.trim());
    }

    const [row] = await this.db("SIGU_LECTURA").raw(
      `
    SELECT DISTINCT
      h.n_codper,
      h.c_codfac,
      h.c_codcur,
      h.c_grpcur,
      h.c_dnidoc,
      h.n_numdia,
      h.c_codmod,
      h.c_codesp,
      h.n_codpla,
      -- Sin las horas el DISTINCT colapsa bloques distintos del mismo grupo y
      -- se pierde a que clase pertenece cada reunion. Ver modules/zoom/horario.ts
      h.c_hh_ini,
      h.c_mi_ini,
      h.c_hh_fin,
      h.c_mi_fin,
      h.c_tipo
    FROM
      tb_curso_grupo_sincro s
      JOIN tb_cur_grp_hor h
        ON s.n_codper = h.n_codper
        AND s.c_codfac = h.c_codfac
        AND s.c_codesp = h.c_codesp
        AND s.c_sedcod = h.c_sedcod
        AND s.c_codcur = h.c_codcur
        AND s.c_grpcur = h.c_grpcur
        AND s.c_codmod = h.c_codmod
        AND s.n_codpla = h.n_codpla
    WHERE
      s.courseid = ?
      AND h.n_numdia = ?
      ${docenteWhere}
    `,
      params,
    );

    return row as {
      n_codper: number;
      c_codfac: string;
      c_codesp: string;
      c_grpcur: string;
      n_codpla: number;
      c_codmod: number;
      c_codcur: string;
      c_dnidoc: string;
      n_numdia: number;
      c_hh_ini: string | null;
      c_mi_ini: string | null;
      c_hh_fin: string | null;
      c_mi_fin: string | null;
      c_tipo: string | null;
    }[];
  }

  // ================================================================
  async createSesiones(
    data: {
      n_codper: number;
      c_codmod: string | number;
      c_codfac: string;
      c_codesp: string;
      c_codcur: string;
      c_grpcur: string;
      c_dnidoc: string;
      d_fecha: string;
      d_fecha_registro: string;
      c_estado?: string;
      c_tema: string;
      n_codpla: number;
      c_sedcod?: string | null;
      tipo?: string | null;
      auto?: string | null;
      mins?: string | null;
      c_user_upd: string;
      d_fecha_upd: Date;
    }[],
  ) {
    if (!data.length) {
      return {
        affectedRows: 0,
      };
    }

    const placeholders = data
      .map(() => `(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .join(",");

    const values = data.flatMap((s) => [
      s.n_codper,
      String(s.c_codmod),
      s.c_codfac,
      s.c_codesp,
      s.c_codcur,
      s.c_grpcur,
      s.c_dnidoc,
      s.d_fecha,
      s.d_fecha_registro,
      s.c_estado ?? "A",
      s.c_tema,
      s.n_codpla,
      s.c_sedcod ?? "1",
      s.tipo ?? "1",
      s.auto ?? "0",
      s.mins ?? "0",
      s.c_user_upd,
      s.d_fecha_upd,
    ]);

    const [row] = await this.db("SIGU_INSERT").raw(
      `
    INSERT INTO tb_asis_alum (
      n_codper,
      c_codmod,
      c_codfac,
      c_codesp,
      c_codcur,
      c_grpcur,
      c_dnidoc,
      d_fecha,
      d_fecha_registro,
      c_estado,
      c_tema,
      n_codpla,
      c_sedcod,
      tipo,
      auto,
      mins,
      c_user_upd,
      d_fecha_upd
    )
    VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE n_codper = n_codper;
    `,
      values,
    );

    return row;
  }

  async getSesiones(courseid: number, d_fecha: string, c_dnidoc: string) {
    const [row] = await this.db("SIGU_LECTURA").raw(
      `
      SELECT 
          h.*
      FROM 
          tb_curso_grupo_sincro s
      JOIN 
          tb_asis_alum h
          ON s.n_codper  = h.n_codper
          AND s.c_codfac = h.c_codfac
          AND s.c_codesp = h.c_codesp
          AND s.c_sedcod = h.c_sedcod
          AND s.c_codcur = h.c_codcur
          AND s.c_grpcur = h.c_grpcur
          AND s.c_codmod = h.c_codmod
          AND s.n_codpla = h.n_codpla
      WHERE
            s.courseid = ?
            AND h.d_fecha = ?
            AND h.c_dnidoc = ?
    `,
      [courseid, d_fecha, c_dnidoc],
    );
    return row as {
      id_asistencia: number;
      n_codper: number;
      c_codmod: string | number;
      c_codfac: string;
      c_codesp: string;
      c_codcur: string;
      c_grpcur: string;
      c_dnidoc: string;
      d_fecha: string;
      d_fecha_registro: string;
      c_estado?: string;
      c_tema: string;
      n_codpla: number;
      c_sedcod?: string | null;
      tipo?: string | null;
      auto?: string | null;
      mins?: string | null;
      c_user_upd: string;
      d_fecha_upd: Date;
    }[];
  }

  async createAsistenciaDetalles(
    data: {
      id_asistencia: number;
      c_codalu: string;
      c_estado: string;
      seguir: string | Date;
    }[],
  ) {
    if (!data.length) {
      return {
        affectedRows: 0,
      };
    }

    const placeholders = data.map(() => `(?,?,?,?)`).join(",");

    const values = data.flatMap((s) => [
      s.id_asistencia,
      s.c_codalu,
      s.c_estado,
      s.seguir,
    ]);

    const [row] = await this.db("SIGU_INSERT").raw(
      `
      INSERT INTO tb_asis_alum_det (
        id_asistencia,
        c_codalu,
        c_estado,
        seguir
      )
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE id_asistencia = id_asistencia;
    `,
      values,
    );

    return row;
  }
}
