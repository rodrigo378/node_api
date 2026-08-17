// Simula que pasaria al volver a correr sincronizarAsistencias sobre las
// instancias ya subidas, con la logica de secciones. NO escribe nada.
//
// Uso:
//   npx tsx src/testing/dryrun-resubida.ts            # desde el 2026-07-27
//   npx tsx src/testing/dryrun-resubida.ts 2026-07-01 # desde otra fecha
//   npx tsx src/testing/dryrun-resubida.ts inst 12604 # una instancia
import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";
import { ZoomRepository } from "../modules/zoom/respository";
import {
  claveBloqueDeTema,
  claveSeccion,
  claveVentana,
  resolverGruposSesion,
  seccionesDeSlots,
} from "../modules/zoom/horario";
import { diaSemanaLima, fechaLima, minutosDiaLima } from "../core/utils/time";

async function main() {
  const [arg1, arg2] = process.argv.slice(2);
  const soloInstancia = arg1 === "inst" ? Number(arg2) : null;
  const desde = soloInstancia ? null : arg1 || "2026-07-27";

  const db = await initDb(env.DB_CONNECTIONS);
  const repo = new ZoomRepository(db);
  const uma = db.get("API_2");
  const sigu = db.get("SIGU_LECTURA");

  // El corte va por updated_at: lo que rompe es CUANDO se subio (commit del
  // 2026-07-27), no la fecha de la clase.
  const [instancias] = await uma.raw(
    `SELECT i.id, i.start_time, i.attendance_status, i.id_asistencia,
            m.courseid
     FROM zoom_meeting_instance i
     JOIN zoom_meeting m ON i.meeting_id = m.id
     WHERE i.attendance_status IN ('UPLOADED','ALREADY_EXISTS')
       AND m.courseid IS NOT NULL AND i.start_time IS NOT NULL
       ${soloInstancia ? "AND i.id = ?" : "AND i.updated_at >= ?"}
     ORDER BY i.start_time`,
    [soloInstancia ?? desde],
  );

  // Una consulta por courseid, no por instancia: el horario y la matricula no
  // cambian entre instancias del mismo curso.
  const cacheHorario = new Map<string, any[]>();
  const cacheMatricula = new Map<number, Map<string, string>>();

  const detalle: any[] = [];
  const resumen = {
    instancias: 0,
    sesionesReutilizadas: 0,
    sesionesNuevas: 0,
    yaEnSigu: 0,
    subiriaAhora: 0,
    sigueSinSesion: 0,
    sinDocente: 0,
    sinBloque: 0,
  };

  for (const inst of instancias as any[]) {
    resumen.instancias++;

    const start = new Date(inst.start_time);
    const d_fecha = fechaLima(start);
    const minutos = minutosDiaLima(start);

    const host = await repo.getDocenteParticipantes(Number(inst.id));
    const dni = host?.c_dnidoc ?? null;
    if (!dni) {
      resumen.sinDocente++;
      continue;
    }

    const claveHorario = `${inst.courseid}|${diaSemanaLima(start)}|${dni}`;
    if (!cacheHorario.has(claveHorario)) {
      cacheHorario.set(
        claveHorario,
        await repo.getHorarioGrupo(inst.courseid, diaSemanaLima(start), dni),
      );
    }
    const horario = cacheHorario.get(claveHorario)!;
    const bloque = resolverGruposSesion({ slots: horario, minutos });
    if (!bloque.length) {
      resumen.sinBloque++;
      continue;
    }

    const seccionesBloque = seccionesDeSlots(bloque);
    const claveBloque = claveVentana(bloque[0]!);

    // Sesiones que ya existen y caen en este bloque.
    const existentes: any[] = await repo.sesionExistente(
      inst.courseid,
      d_fecha,
      dni,
    );
    const yaHay = new Set<string>();
    for (const s of existentes ?? []) {
      const seccion = claveSeccion(s);
      if (!seccionesBloque.includes(seccion)) continue;
      const clave = claveBloqueDeTema(s.c_tema, horario);
      if (clave !== null && clave !== claveBloque) continue;
      yaHay.add(seccion);
    }

    const nuevas = seccionesBloque.filter((s) => !yaHay.has(s));

    // Alumnos que quedarian cubiertos.
    if (!cacheMatricula.has(Number(inst.courseid))) {
      const matriculados = await repo.getMatriculadosCourseid(inst.courseid);
      cacheMatricula.set(
        Number(inst.courseid),
        new Map(
          matriculados.map((m) => [String(m.c_codalu).trim(), claveSeccion(m)]),
        ),
      );
    }
    const seccionPorAlumno = cacheMatricula.get(Number(inst.courseid))!;

    const participantes = await repo.getZoomMeetingParticipant(Number(inst.id));
    const elegibles = participantes.filter(
      (p: any) =>
        Number(p.corresponde_sesion) === 1 && Number(p.attendance) === 1,
    );

    let cubiertos = 0;
    let huerfanos = 0;
    const detalleHuerfanos: any[] = [];
    for (const p of elegibles as any[]) {
      const seccion = seccionPorAlumno.get(String(p.c_codalu ?? "").trim());
      if (seccion && seccionesBloque.includes(seccion)) {
        cubiertos++;
      } else {
        huerfanos++;
        detalleHuerfanos.push({
          c_codalu: p.c_codalu,
          nombre: String(p.name ?? "").slice(0, 32),
          seccionAlumno: seccion ?? "sin matricula",
        });
      }
    }

    if (soloInstancia && detalleHuerfanos.length) {
      console.log(`\nsecciones del bloque: ${seccionesBloque.join(", ")}`);
      console.log("alumnos presentes que no pertenecen a ninguna:");
      console.table(detalleHuerfanos);
    }

    // Lo que hoy hay en SIGU para esta instancia.
    const ids = String(inst.id_asistencia ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let subidosHoy = 0;
    if (ids.length) {
      const [det] = await sigu.raw(
        `SELECT COUNT(*) c FROM tb_asis_alum_det
         WHERE id_asistencia IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      subidosHoy = Number((det as any[])[0]?.c ?? 0);
    }

    resumen.sesionesReutilizadas += yaHay.size;
    resumen.sesionesNuevas += nuevas.length;
    resumen.yaEnSigu += subidosHoy;
    resumen.subiriaAhora += Math.max(0, cubiertos - subidosHoy);
    resumen.sigueSinSesion += huerfanos;

    if (cubiertos - subidosHoy > 0 || soloInstancia) {
      detalle.push({
        inst: inst.id,
        courseid: inst.courseid,
        fecha: d_fecha,
        estado: inst.attendance_status,
        secciones: seccionesBloque.length,
        reusa: yaHay.size,
        crea: nuevas.length,
        enSigu: subidosHoy,
        recupera: Math.max(0, cubiertos - subidosHoy),
        huerfanos,
      });
    }
  }

  console.log("\n=== resumen de la re-subida simulada ===");
  console.table([resumen]);

  console.log("\n=== instancias que recuperarian asistencia (top 30) ===");
  console.table(
    detalle.sort((a, b) => b.recupera - a.recupera).slice(0, 30),
  );

  console.log("\nNo se escribio nada en ninguna base.\n");

  await db.closeAll();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
