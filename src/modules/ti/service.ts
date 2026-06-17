import { MoodleHttpClient, MoodleUser } from "./http";
import { TiRepository } from "./repository";

type TiJobSource = "manual" | "scheduler" | string;

interface TiPayload {
  courseIds?: Array<number | string>;
  courseids?: Array<number | string>;
  executionMode?: string;
  [key: string]: unknown;
}

interface TiContext {
  source?: TiJobSource;
  payload?: TiPayload;
  schedule_id?: number;
  meta?: {
    usuario_id?: number;
    user_agent?: string;
    ip?: string;
  } | null;
  traceId?: string;
}

interface BatchDto {
  courseids?: number[];
  source?: string;
  schedule_id?: number;
}

interface MoodleGroupedUsers {
  alumnosMoodle: MoodleUser[];
  docentesMoodle: MoodleUser[];
}

export class TiService {
  constructor(
    private readonly tiRepository: TiRepository,
    private readonly moodleHttp: MoodleHttpClient,
  ) {}

  test(ctx: TiContext) {
    if (ctx.source === "scheduler") {
      return {
        msg: "test ejecutado por cron/scheduler",
        tipo: "automatico",
        schedule_id: ctx.schedule_id ?? null,
        payload_usado: ctx.payload ?? {},
        traceId: ctx.traceId ?? null,
      };
    }

    if (ctx.source === "manual") {
      return {
        msg: "test ejecutado manualmente",
        tipo: "manual",
        usuario_id: ctx.meta?.usuario_id ?? null,
        payload_usado: ctx.payload ?? {},
        traceId: ctx.traceId ?? null,
      };
    }

    return {
      msg: "test ejecutado",
      tipo: "desconocido",
      source: ctx.source ?? null,
      payload_usado: ctx.payload ?? {},
      traceId: ctx.traceId ?? null,
    };
  }

  async getMatriculadosMoodle(courseid: number) {
    const response = await this.moodleHttp.getMatriculadosMoodle(courseid);

    const grouped = response.reduce<MoodleGroupedUsers>(
      (acc: MoodleGroupedUsers, user: MoodleUser) => {
        const role = user.roles[0]?.shortname;

        const mapped: MoodleUser = {
          id: user.id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          roles: user.roles,
        };

        if (role === "student") {
          acc.alumnosMoodle.push(mapped);
        } else if (role === "editingteacher") {
          acc.docentesMoodle.push(mapped);
        }

        return acc;
      },
      {
        alumnosMoodle: [],
        docentesMoodle: [],
      },
    );

    return grouped;
  }

  async getMatriculadosSigu(courseid: number) {
    const responseMatriculados =
      await this.tiRepository.getMatriculados(courseid);

    const matriculados: string[] = [];
    const emailsInvalidosSigu: unknown[] = [];

    for (const row of responseMatriculados) {
      const email = row.c_email_institucional?.trim();

      if (!email) {
        emailsInvalidosSigu.push(row);
      } else {
        matriculados.push(email);
      }
    }

    if (emailsInvalidosSigu.length > 0) {
      throw new Error(
        `SIGU devolvió ${emailsInvalidosSigu.length} registro(s) sin email institucional para courseid=${courseid}`,
      );
    }

    if (matriculados.length === 0) return [];

    const response = await this.moodleHttp.getUsersByEmail(matriculados);

    const emailsEncontrados = new Set(
      response.map((user: MoodleUser) => user.email.toLowerCase()),
    );

    const emailsFaltantes = matriculados.filter(
      (email: string) => !emailsEncontrados.has(email.toLowerCase()),
    );

    if (emailsFaltantes.length > 0) {
      throw new Error(
        `Los siguientes emails de SIGU no existen en Moodle: ${emailsFaltantes.join(", ")}`,
      );
    }

    return response.map((alumno: MoodleUser): MoodleUser => {
      return {
        id: alumno.id,
        firstname: alumno.firstname,
        lastname: alumno.lastname,
        email: alumno.email,
        roles: [
          {
            roleid: 5,
            name: "ESTUDIANTE",
            shortname: "student",
            sortorder: 0,
          },
        ],
      };
    });
  }

  async getDocentesSigu(courseid: number) {
    const responseDocentes = await this.tiRepository.getDocentes(courseid);

    const docentes: string[] = [];
    const emailsInvalidosSigu: unknown[] = [];

    for (const row of responseDocentes) {
      const email = row.c_email_institucional?.trim();

      if (!email) {
        emailsInvalidosSigu.push(row);
      } else {
        docentes.push(email);
      }
    }

    if (emailsInvalidosSigu.length > 0) {
      throw new Error(
        `SIGU devolvió ${emailsInvalidosSigu.length} docente(s) sin email institucional para courseid=${courseid}`,
      );
    }

    if (docentes.length === 0) return [];

    const response = await this.moodleHttp.getUsersByEmail(docentes);

    const emailsEncontrados = new Set(
      response.map((user: MoodleUser) => user.email.toLowerCase()),
    );

    const emailsFaltantes = docentes.filter(
      (email: string) => !emailsEncontrados.has(email.toLowerCase()),
    );

    if (emailsFaltantes.length > 0) {
      throw new Error(
        `Los siguientes emails de docentes SIGU no existen en Moodle: ${emailsFaltantes.join(", ")}`,
      );
    }

    return response.map((docente: MoodleUser): MoodleUser => {
      return {
        id: docente.id,
        firstname: docente.firstname,
        lastname: docente.lastname,
        email: docente.email,
        roles: [
          {
            roleid: 3,
            name: "DOCENTE",
            shortname: "editingteacher",
            sortorder: 0,
          },
        ],
      };
    });
  }

  async sincronizar(courseid: number) {
    const [moodle, alumnosSigu, docentesSigu] = await Promise.all([
      this.getMatriculadosMoodle(courseid),
      this.getMatriculadosSigu(courseid),
      this.getDocentesSigu(courseid),
    ]);

    const { alumnosMoodle, docentesMoodle } = moodle;

    const setSigu = new Set(alumnosSigu.map((alumno: MoodleUser) => alumno.id));
    const setMoodle = new Set(
      alumnosMoodle.map((alumno: MoodleUser) => alumno.id),
    );

    const setDocenteSigu = new Set(
      docentesSigu.map((docente: MoodleUser) => docente.id),
    );

    const setDocentesMoodle = new Set(
      docentesMoodle.map((docente: MoodleUser) => docente.id),
    );

    const usuariosIgnorados = new Set([
      "maria.martin@uma.edu.pe",
      "julio.mendigure@uma.edu.pe",
    ]);

    const nuevo = alumnosSigu.filter(
      (alumno: MoodleUser) => !setMoodle.has(alumno.id),
    );

    const borrar = alumnosMoodle.filter(
      (alumno: MoodleUser) =>
        !setSigu.has(alumno.id) && !usuariosIgnorados.has(alumno.email),
    );

    const nuevoDocentes = docentesSigu.filter(
      (docente: MoodleUser) => !setDocentesMoodle.has(docente.id),
    );

    const borrarDocentes = docentesMoodle.filter(
      (docente: MoodleUser) => !setDocenteSigu.has(docente.id),
    );

    console.log("courseid => ", courseid);
    console.log("nuevo => ", nuevo);
    console.log("borrar => ", borrar);
    console.log("nuevoDocentes => ", nuevoDocentes);
    console.log("borrarDocentes => ", borrarDocentes);

    // const aSuspender = [...borrar, ...borrarDocentes].map(
    //   (user: MoodleUser) => {
    //     return {
    //       id: user.id,
    //       roleid: user.roles[0]!.roleid,
    //     };
    //   },
    // );

    // await this.moodleHttp.suspenderMatricula(aSuspender, courseid);
    // await this.moodleHttp.matricular([...nuevo, ...nuevoDocentes], courseid);

    return {
      alumnosSigu: alumnosSigu.length,
      alumnosMoodle: alumnosMoodle.length,
      docenteSigu: docentesSigu.length,
      docenteMoodle: docentesMoodle.length,
      nuevo: nuevo.length,
      borrar: borrar.length,
      nuevoDocentes: nuevoDocentes.length,
      borrarDocentes: borrarDocentes.length,
    };
  }

  private async poolMap<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ) {
    const results = new Array<R>(items.length);
    let i = 0;

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (true) {
          const index = i++;

          if (index >= items.length) break;

          const item = items[index];

          if (item === undefined) break;

          results[index] = await mapper(item, index);
        }
      },
    );

    await Promise.all(workers);

    return results;
  }

  async sincronizarBatch(dto: BatchDto) {
    let courseids = dto.courseids ?? [];

    if (dto.source === "scheduler") {
      if (!dto.schedule_id) {
        throw new Error("No se recibió schedule_id para ejecución scheduler.");
      }

      // courseids = await this.tiRepository.getScheduleItemCourseIds(
      //   dto.schedule_id,
      // );
      courseids = [5895];
    }

    if (courseids.length === 0) {
      throw new Error(
        dto.source === "scheduler"
          ? `No hay courseids configurados en sch_schedule_item para schedule_id=${dto.schedule_id}`
          : "No se recibieron courseIds/courseids para ejecución manual.",
      );
    }

    const CONCURRENCY = 6;

    return this.poolMap(courseids, CONCURRENCY, async (courseid: number) => {
      try {
        console.log("2 courseid => ", courseid);

        const data = await this.sincronizar(courseid);

        return {
          courseid,
          ok: true,
          data,
        };
      } catch (e: unknown) {
        const error =
          e instanceof Error
            ? e.message
            : typeof e === "string"
              ? e
              : JSON.stringify(e);

        return {
          courseid,
          ok: false,
          error,
        };
      }
    });
  }
}
