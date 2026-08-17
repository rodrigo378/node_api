// Reporte de solo lectura: cuanta asistencia quedo sin subir a SIGU.
//
// Cruza zoom_meeting_participants (db_uma) contra tb_asis_alum_det
// (jaguar_db_sigu) usando el id_asistencia que guarda cada instancia, y desglosa
// la perdida por causa.
//
// Uso: npx tsx src/testing/audit-asistencia-perdida.ts [courseid]
//
// NO escribe nada en ninguna base. Solo SELECT.
import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";

type Fila = {
  inst: number;
  courseid: number | null;
  fecha: string;
  estado: string;
  sesiones: number;
  elegibles: number;
  subidos: number;
  perdidos: number;
};

async function main() {
  const courseid = Number(process.argv[2]) || null;

  const db = await initDb(env.DB_CONNECTIONS);
  const uma = db.get("API_2");
  const sigu = db.get("SIGU_LECTURA");

  // Elegibles = presentes que el worker considero que correspondian a la sesion.
  const [crudo] = await uma.raw(
    `SELECT i.id, i.start_time, i.attendance_status, i.id_asistencia,
            m.courseid, COUNT(*) AS elegibles
     FROM zoom_meeting_instance i
     JOIN zoom_meeting m ON i.meeting_id = m.id
     JOIN zoom_meeting_participants p ON p.instance_id = i.id
     WHERE p.attendance = 1 AND p.corresponde_sesion = 1
       AND i.attendance_status IN ('UPLOADED','ALREADY_EXISTS')
       AND i.id_asistencia IS NOT NULL AND i.id_asistencia <> ''
       ${courseid ? "AND m.courseid = ?" : ""}
     GROUP BY i.id, i.start_time, i.attendance_status, i.id_asistencia, m.courseid
     ORDER BY i.start_time`,
    courseid ? [courseid] : [],
  );

  const rows = crudo as any[];

  const idsDe = (v: unknown) =>
    String(v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const todos = [...new Set(rows.flatMap((f) => idsDe(f.id_asistencia)))];

  // En lotes: la lista de sesiones puede pasar los miles.
  const subidosPorSesion = new Map<string, number>();
  for (let i = 0; i < todos.length; i += 1000) {
    const lote = todos.slice(i, i + 1000);
    const [det] = await sigu.raw(
      `SELECT id_asistencia, COUNT(*) AS subidos FROM tb_asis_alum_det
       WHERE id_asistencia IN (${lote.map(() => "?").join(",")})
       GROUP BY id_asistencia`,
      lote,
    );
    for (const r of det as any[]) {
      subidosPorSesion.set(String(r.id_asistencia), Number(r.subidos));
    }
  }

  const filas: Fila[] = rows.map((f) => {
    const ids = idsDe(f.id_asistencia);
    const subidos = ids.reduce(
      (acc, id) => acc + (subidosPorSesion.get(id) ?? 0),
      0,
    );
    return {
      inst: Number(f.id),
      courseid: f.courseid == null ? null : Number(f.courseid),
      fecha: String(new Date(f.start_time).toISOString()).slice(0, 10),
      estado: String(f.attendance_status),
      sesiones: ids.length,
      elegibles: Number(f.elegibles),
      subidos,
      perdidos: Math.max(0, Number(f.elegibles) - subidos),
    };
  });

  const totales = (lista: Fila[]) => ({
    instancias: lista.length,
    elegibles: lista.reduce((a, r) => a + r.elegibles, 0),
    subidos: lista.reduce((a, r) => a + r.subidos, 0),
    perdidos: lista.reduce((a, r) => a + r.perdidos, 0),
  });

  console.log(
    `\n${filas.length} instancias con id_asistencia` +
      `${courseid ? ` (courseid ${courseid})` : ""}`,
  );

  console.log("\n=== total ===");
  console.table([totales(filas)]);

  console.log("\n=== por estado ===");
  console.table(
    ["UPLOADED", "ALREADY_EXISTS"].map((e) => ({
      estado: e,
      ...totales(filas.filter((r) => r.estado === e)),
    })),
  );

  // Perdida total: la sesion existe pero no entro NADIE. Es el sintoma del
  // colapso por grupo (la seccion que gano no tenia alumnos) o del viejo
  // ALREADY_EXISTS que saltaba el detalle.
  const cero = filas.filter((r) => r.subidos === 0 && r.elegibles > 0);
  console.log("\n=== instancias con CERO subidos ===");
  console.table([totales(cero)]);

  console.log("\n=== peores 25 ===");
  console.table(
    [...filas].sort((a, b) => b.perdidos - a.perdidos).slice(0, 25),
  );

  console.log("\n=== cursos mas afectados ===");
  const porCurso = new Map<number, Fila[]>();
  for (const r of filas) {
    if (r.courseid == null) continue;
    porCurso.set(r.courseid, [...(porCurso.get(r.courseid) ?? []), r]);
  }
  console.table(
    [...porCurso.entries()]
      .map(([cid, lista]) => ({ courseid: cid, ...totales(lista) }))
      .sort((a, b) => b.perdidos - a.perdidos)
      .slice(0, 20),
  );

  console.log("\nNo se escribio nada en la BD.\n");

  await db.closeAll();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
