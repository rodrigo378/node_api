import "dotenv/config";
import { env } from "../core/config/env";
import { initDb } from "../core/db";

async function main() {
  const db = await initDb(env.DB_CONNECTIONS);
  const sigu = db.get("SIGU_LECTURA");

  const [idx] = await sigu.raw(`SHOW INDEX FROM tb_asis_alum_det`);
  console.log("=== INDEX tb_asis_alum_det ===");
  console.table(
    (idx as any[]).map((r) => ({
      Key: r.Key_name,
      Uniq: r.Non_unique === 0 ? "YES" : "",
      Seq: r.Seq_in_index,
      Col: r.Column_name,
    })),
  );

  const [cols] = await sigu.raw(`SHOW COLUMNS FROM tb_asis_alum_det`);
  console.log("=== COLUMNS tb_asis_alum_det ===");
  console.log((cols as any[]).map((c) => `${c.Field}:${c.Type}`).join(", "));

  const [users] = await sigu.raw(
    `SELECT c_user_upd, COUNT(*) c,
            MIN(d_fecha) desde, MAX(d_fecha) hasta,
            SUM(c_tema LIKE '[AUTO]%') auto_tema
     FROM tb_asis_alum
     WHERE n_codper = 20262
     GROUP BY c_user_upd ORDER BY c DESC LIMIT 25`,
  );
  console.log("=== tb_asis_alum periodo 20262 por c_user_upd ===");
  console.table(users);

  const [tipos] = await sigu.raw(
    `SELECT tipo, auto, COUNT(*) c FROM tb_asis_alum
     WHERE n_codper = 20262 GROUP BY tipo, auto ORDER BY c DESC LIMIT 15`,
  );
  console.log("=== combinaciones tipo/auto ===");
  console.table(tipos);

  const [ejemplos] = await sigu.raw(
    `SELECT id_asistencia, c_codcur, c_grpcur, d_fecha, c_tema, tipo, auto, mins, c_user_upd
     FROM tb_asis_alum
     WHERE n_codper = 20262 AND c_user_upd <> 'boot.v2'
     ORDER BY d_fecha DESC LIMIT 12`,
  );
  console.log("=== ejemplos NO boot.v2 ===");
  for (const r of ejemplos as any[]) {
    console.log(
      `${r.id_asistencia} | ${r.c_codcur} ${r.c_grpcur} | ${String(r.d_fecha).slice(0, 10)}` +
        ` | tipo ${r.tipo} auto ${r.auto} mins ${r.mins} | ${r.c_user_upd} | ${r.c_tema}`,
    );
  }

  await db.closeAll();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
