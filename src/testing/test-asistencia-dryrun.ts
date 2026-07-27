// worker-sync/src/testing/test-asistencia-dryrun.ts
//
// Dry-run de la resolucion de sesiones: lee instancias reales y muestra que
// sesiones de tb_asis_alum se crearian, SIN escribir nada en ninguna BD.
//
// Uso:
//   npm run test:dryrun            -> detalle del courseid 6855
//   npm run test:dryrun 1234       -> detalle de un courseid
//   npm run test:dryrun all        -> resumen de todos los cursos sincronizados

import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";
import { ZoomRepository } from "../modules/zoom/respository";
import {
  docentesDelBloque,
  gruposDeSlots,
  resolverGruposSesion,
} from "../modules/zoom/horario";
import {
  diaSemanaLima,
  fechaLima,
  horaMinLima,
  minutosDiaLima,
} from "../core/utils/time";

type Instancia = {
  id: number;
  start_time: Date | null;
  attendance_status: string;
  zoom_meeting_id: bigint;
  courseid: number;
};

type Resultado = {
  inst: Instancia;
  dniGuardado: string | null;
  candidatos: string[];
  ventana: string;
  antes: string[];
  ahora: string[];
};

async function resolver(
  repo: ZoomRepository,
  inst: Instancia,
): Promise<Resultado | null> {
  const start = inst.start_time;
  if (!start) return null;

  const minutos = minutosDiaLima(start);
  const n_numdia = diaSemanaLima(start);

  // Docente que elegiria la logica nueva al reprocesar participantes.
  const horarioDia = await repo.getHorarioGrupo(inst.courseid, n_numdia);
  const candidatos = docentesDelBloque({ slots: horarioDia, minutos });

  // Docente guardado por la corrida anterior: es el que usa subirAsistencia.
  const docente = await repo.getDocenteParticipantes(Number(inst.id));
  const dniGuardado = docente?.c_dnidoc ?? null;

  if (!dniGuardado) {
    return { inst, dniGuardado, candidatos, ventana: "-", antes: [], ahora: [] };
  }

  const horario = await repo.getHorarioGrupo(
    inst.courseid,
    n_numdia,
    dniGuardado,
  );
  const bloque = resolverGruposSesion({ slots: horario, minutos });

  return {
    inst,
    dniGuardado,
    candidatos,
    ventana: bloque[0]
      ? `${bloque[0].c_hh_ini}:${bloque[0].c_mi_ini}-${bloque[0].c_hh_fin}:${bloque[0].c_mi_fin}`
      : "ninguna",
    antes: gruposDeSlots(horario), // lo que se creaba antes del fix
    ahora: gruposDeSlots(bloque),
  };
}

async function main() {
  const arg = process.argv[2];
  const todos = arg === "all";
  const courseid = todos ? null : Number(arg) || 6855;

  const db = await initDb(env.DB_CONNECTIONS);
  const repo = new ZoomRepository(db);
  const api = db.get("API_2");

  const [filas] = await api.raw(
    `SELECT i.id, i.start_time, i.attendance_status,
            m.zoom_meeting_id, m.courseid
     FROM zoom_meeting_instance i
     JOIN zoom_meeting m ON i.meeting_id = m.id
     WHERE m.courseid IS NOT NULL ${courseid === null ? "" : "AND m.courseid = ?"}
     ORDER BY m.courseid, i.start_time`,
    courseid === null ? [] : [courseid],
  );

  const instancias = filas as Instancia[];
  console.log(
    `\n${instancias.length} instancias${courseid === null ? " (todos los cursos)" : ` — courseid ${courseid}`}\n`,
  );

  const resumen = {
    sinStartTime: 0,
    sinDocente: 0,
    sinBloque: 0,
    ambiguo: 0,
    docenteCambia: 0,
    gruposRecortados: 0,
    igual: 0,
  };

  for (const inst of instancias) {
    const r = await resolver(repo, inst);

    if (!r) {
      resumen.sinStartTime++;
      continue;
    }

    if (r.candidatos.length > 1) resumen.ambiguo++;
    if (!r.candidatos.length) resumen.sinBloque++;
    if (r.dniGuardado && r.candidatos[0] && r.candidatos[0] !== r.dniGuardado) {
      resumen.docenteCambia++;
    }

    if (!r.dniGuardado) {
      resumen.sinDocente++;
    } else if (r.antes.join() !== r.ahora.join()) {
      resumen.gruposRecortados++;
    } else {
      resumen.igual++;
    }

    if (todos) continue;

    const start = r.inst.start_time!;
    const cabecera =
      `inst ${String(r.inst.id).padStart(5)} | ${fechaLima(start)} ${horaMinLima(start)}` +
      ` | sala ${r.inst.zoom_meeting_id} | ${String(r.inst.attendance_status).padEnd(22)}` +
      ` | doc ${(r.dniGuardado ?? "?").padEnd(8)} -> ${(r.candidatos[0] ?? "NULL").padEnd(8)}` +
      `${r.candidatos.length > 1 ? " AMBIGUO" : "        "}`;

    if (!r.dniGuardado) {
      console.log(`${cabecera} | -> SIN_DNIDOCENTE`);
      continue;
    }

    console.log(
      `${cabecera} | bloque ${r.ventana.padEnd(11)}` +
        ` | antes [${r.antes.join(",")}] -> ahora [${r.ahora.join(",")}]` +
        ` ${r.antes.join() === r.ahora.join() ? " " : "*"}`,
    );
  }

  console.log("\n=== resumen ===");
  console.log(`  grupos recortados por el fix : ${resumen.gruposRecortados}`);
  console.log(`  sin cambio                   : ${resumen.igual}`);
  console.log(`  bloque con docente ambiguo   : ${resumen.ambiguo}`);
  console.log(`  docente distinto al guardado : ${resumen.docenteCambia}`);
  console.log(`  fuera de todo bloque         : ${resumen.sinBloque}`);
  console.log(`  sin docente guardado         : ${resumen.sinDocente}`);
  console.log(`  sin start_time               : ${resumen.sinStartTime}`);
  console.log("\nNo se escribio nada en la BD.\n");

  await db.closeAll();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
