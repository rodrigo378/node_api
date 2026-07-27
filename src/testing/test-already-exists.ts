// worker-sync/src/testing/test-already-exists.ts
//
// Audita las instancias marcadas ALREADY_EXISTS: para cada una compara los
// grupos de su bloque horario contra las sesiones que REALMENTE existen en
// tb_asis_alum. Muestra que grupos quedaron sin sesion por el dedupe por dia.
//
// Solo lee. No escribe nada en ninguna BD.
//
// Uso: npm run test:already [courseid]

import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";
import { ZoomRepository } from "../modules/zoom/respository";
import { gruposDeSlots, resolverGruposSesion } from "../modules/zoom/horario";
import {
  diaSemanaLima,
  fechaLima,
  horaMinLima,
  minutosDiaLima,
} from "../core/utils/time";

async function main() {
  const arg = process.argv[2];
  const courseid = arg === "all" ? null : Number(arg) || 6855;

  const db = await initDb(env.DB_CONNECTIONS);
  const repo = new ZoomRepository(db);
  const api = db.get("API_2");
  const sigu = db.get("SIGU_LECTURA");

  const [filas] = await api.raw(
    `SELECT i.id, i.start_time, i.id_asistencia, m.courseid, m.zoom_meeting_id
     FROM zoom_meeting_instance i
     JOIN zoom_meeting m ON i.meeting_id = m.id
     WHERE i.attendance_status = 'ALREADY_EXISTS'
       AND m.courseid IS NOT NULL
       ${courseid === null ? "" : "AND m.courseid = ?"}
     ORDER BY m.courseid, i.start_time`,
    courseid === null ? [] : [courseid],
  );

  const instancias = filas as any[];
  console.log(`\n${instancias.length} instancias ALREADY_EXISTS\n`);

  let conFaltantes = 0;
  let gruposFaltantes = 0;
  let sinDetalle = 0;

  for (const inst of instancias) {
    const start: Date | null = inst.start_time;
    if (!start) continue;

    const docente = await repo.getDocenteParticipantes(Number(inst.id));
    const dni = docente?.c_dnidoc;
    if (!dni) continue;

    const d_fecha = fechaLima(start);
    const horario = await repo.getHorarioGrupo(
      inst.courseid,
      diaSemanaLima(start),
      dni,
    );

    const bloque = resolverGruposSesion({
      slots: horario,
      minutos: minutosDiaLima(start),
    });
    const gruposBloque = gruposDeSlots(bloque);

    // Lo que el codigo viejo miraba: cualquier sesion de ese dia y docente.
    const existentes = (await repo.sesionExistente(
      inst.courseid,
      d_fecha,
      dni,
    )) as any[];

    const mapa = new Map<string, number>();
    for (const s of existentes ?? []) {
      mapa.set(String(s.c_grpcur).trim(), s.id_asistencia);
    }

    const faltan = gruposBloque.filter((g) => !mapa.has(g));

    // Detalles cargados para las sesiones que si existen del bloque.
    const idsBloque = gruposBloque
      .map((g) => mapa.get(g))
      .filter((v): v is number => typeof v === "number");

    let detalles = 0;
    if (idsBloque.length) {
      const [det] = await sigu.raw(
        `SELECT COUNT(*) c FROM tb_asis_alum_det
         WHERE id_asistencia IN (${idsBloque.map(() => "?").join(",")})`,
        idsBloque,
      );
      detalles = Number((det as any[])[0]?.c ?? 0);
    }

    if (faltan.length) {
      conFaltantes++;
      gruposFaltantes += faltan.length;
    }
    if (!detalles) sinDetalle++;

    const marca = faltan.length ? "FALTA" : "  ok ";

    console.log(
      `${marca} inst ${String(inst.id).padStart(5)} | course ${inst.courseid}` +
        ` | ${d_fecha} ${horaMinLima(start)} | doc ${dni}` +
        ` | bloque [${gruposBloque.join(",")}]` +
        ` | existen [${[...mapa.entries()].map(([g, id]) => `${g}=${id}`).join(" ")}]` +
        ` | sin sesion [${faltan.join(",")}]` +
        ` | detalles ${detalles}`,
    );
  }

  console.log("\n=== resumen ===");
  console.log(`  instancias auditadas          : ${instancias.length}`);
  console.log(`  con grupos sin sesion         : ${conFaltantes}`);
  console.log(`  grupos sin sesion (total)     : ${gruposFaltantes}`);
  console.log(`  bloques sin detalle cargado   : ${sinDetalle}`);
  console.log("\nNo se escribio nada en la BD.\n");

  await db.closeAll();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
