// worker-sync/src/testing/test-horario.ts
//
// Tests de las funciones puras de resolucion de bloque horario / grupos / docente.
// Uso: npm run test:horario
//
// Los datos son reales: courseid 6855 (PMHU1031), viernes, periodo 20262.

import assert from "node:assert/strict";
import {
  claveBloqueDeTema,
  claveVentana,
  distanciaAVentana,
  docentesDelBloque,
  elegirDocente,
  esTardanza,
  gruposDeSlots,
  inicioProgramadoSlot,
  resolverGruposSesion,
  seleccionarSlotsPorHora,
  ventanaSlot,
  type SlotHorario,
} from "../modules/zoom/horario";
import {
  desdeMinutosLima,
  diaSemanaLima,
  diaTextoLima,
  fechaLima,
  horaMinLima,
  minutosDiaLima,
} from "../core/utils/time";

const MARLENE = "23986303";
const GINEZ = "70752720";

const slot = (
  c_grpcur: string,
  c_dnidoc: string,
  hi: string,
  mi: string,
  hf: string,
  mf: string,
): SlotHorario => ({
  c_grpcur,
  c_dnidoc,
  c_hh_ini: hi,
  c_mi_ini: mi,
  c_hh_fin: hf,
  c_mi_fin: mf,
  n_codper: 20262,
  c_codfac: "S",
  c_codesp: "S7",
  c_codcur: "PMHU1031",
  c_codmod: "1",
  n_codpla: 2025,
  n_numdia: 5,
  c_tipo: "VIR",
});

// Horario real del courseid 6855 los viernes.
const HORARIO: SlotHorario[] = [
  slot("N1", MARLENE, "17", "10", "18", "50"),
  slot("N1", MARLENE, "18", "50", "20", "30"),
  slot("N2", MARLENE, "17", "10", "18", "50"),
  slot("N2", GINEZ, "18", "50", "20", "30"),
];

const del = (dnidoc: string) => HORARIO.filter((s) => s.c_dnidoc === dnidoc);

let ok = 0;
function test(nombre: string, fn: () => void) {
  try {
    fn();
    ok++;
    console.log(`  ok  ${nombre}`);
  } catch (e: any) {
    console.error(`FAIL  ${nombre}`);
    console.error(`      ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("\n== time.ts (America/Lima) ==");

test("convierte UTC a hora civil de Lima", () => {
  // Reunion real: instancia 9176, 2026-07-17 20:11:36 Lima.
  const d = new Date("2026-07-18T01:11:36.000Z");
  assert.equal(fechaLima(d), "2026-07-17");
  assert.equal(horaMinLima(d), "20:11");
  assert.equal(diaSemanaLima(d), 5); // viernes
  assert.equal(diaTextoLima(d), "Vie");
  assert.equal(minutosDiaLima(d), 20 * 60 + 11);
});

test("no depende del TZ del proceso", () => {
  const d = new Date("2026-07-18T02:30:00.000Z");
  assert.equal(fechaLima(d), "2026-07-17");
  assert.equal(horaMinLima(d), "21:30");
});

console.log("\n== ventanas horarias ==");

test("ventanaSlot devuelve minutos desde medianoche", () => {
  assert.deepEqual(ventanaSlot(HORARIO[1]!), {
    ini: 18 * 60 + 50,
    fin: 20 * 60 + 30,
  });
});

test("claveVentana agrupa slots del mismo bloque", () => {
  assert.equal(claveVentana(HORARIO[1]!), claveVentana(HORARIO[3]!));
  assert.notEqual(claveVentana(HORARIO[0]!), claveVentana(HORARIO[1]!));
});

test("distanciaAVentana es 0 dentro del bloque", () => {
  assert.equal(distanciaAVentana(HORARIO[1]!, 20 * 60 + 11), 0);
  assert.equal(distanciaAVentana(HORARIO[1]!, 19 * 60 + 2), 0);
});

test("el limite superior pertenece al bloque siguiente", () => {
  const m = 18 * 60 + 50;
  assert.equal(
    distanciaAVentana(HORARIO[1]!, m),
    0,
    "18:50 entra al bloque 18:50-20:30",
  );
  assert.ok(
    distanciaAVentana(HORARIO[0]!, m) > 0,
    "18:50 ya salio del bloque 17:10-18:50",
  );
});

test("distanciaAVentana mide minutos fuera del bloque", () => {
  assert.equal(distanciaAVentana(HORARIO[1]!, 18 * 60 + 41), 9);
});

test("slot sin hora no matchea nunca", () => {
  const roto = slot("N9", MARLENE, "", "", "", "");
  assert.equal(distanciaAVentana(roto, 18 * 60 + 41), Infinity);
  assert.deepEqual(seleccionarSlotsPorHora([roto], 18 * 60 + 41), []);
});

test("slot con fin antes del inicio no matchea", () => {
  const roto = slot("N9", MARLENE, "20", "30", "18", "50");
  assert.deepEqual(seleccionarSlotsPorHora([roto], 20 * 60 + 35), []);
});

console.log("\n== seleccion de bloque por hora ==");

test("BUG REPORTADO: 20:11 selecciona SOLO el bloque 18:50-20:30", () => {
  const sel = seleccionarSlotsPorHora(del(MARLENE), 20 * 60 + 11);
  assert.deepEqual(
    gruposDeSlots(sel),
    ["N1"],
    "N2 no dicta 18:50-20:30 con este docente",
  );
});

test("17:13 selecciona el bloque compartido 17:10-18:50", () => {
  const sel = seleccionarSlotsPorHora(del(MARLENE), 17 * 60 + 13);
  assert.deepEqual(gruposDeSlots(sel), ["N1", "N2"]);
});

test("18:52 selecciona el bloque 18:50-20:30", () => {
  const sel = seleccionarSlotsPorHora(del(MARLENE), 18 * 60 + 52);
  assert.deepEqual(gruposDeSlots(sel), ["N1"]);
});

test("sala abierta 9 min antes cae a su bloque", () => {
  const sel = seleccionarSlotsPorHora(del(GINEZ), 18 * 60 + 41);
  assert.deepEqual(gruposDeSlots(sel), ["N2"]);
});

test("fuera de tolerancia no devuelve nada", () => {
  assert.deepEqual(seleccionarSlotsPorHora(del(MARLENE), 12 * 60), []);
});

test("tolerancia configurable", () => {
  // 16:40 esta a 30 min de 17:10.
  assert.deepEqual(gruposDeSlots(seleccionarSlotsPorHora(del(MARLENE), 16 * 60 + 40)), [
    "N1",
    "N2",
  ]);
  assert.deepEqual(seleccionarSlotsPorHora(del(MARLENE), 16 * 60 + 40, 15), []);
});

test("sin slots devuelve vacio", () => {
  assert.deepEqual(seleccionarSlotsPorHora([], 20 * 60), []);
});

console.log("\n== eleccion de docente ==");

test("un solo docente se elige directo aunque la hora no calce", () => {
  const dni = elegirDocente({ slots: del(GINEZ), minutos: 18 * 60 + 41 });
  assert.equal(dni, GINEZ);
});

test("bloque con un solo docente lo elige", () => {
  const dni = elegirDocente({ slots: HORARIO, minutos: 17 * 60 + 13 });
  assert.equal(dni, MARLENE, "17:10-18:50 solo lo dicta MARLENE");
});

test("bloque con dos docentes queda ambiguo y expone los dos DNI", () => {
  const dnis = docentesDelBloque({ slots: HORARIO, minutos: 19 * 60 });
  assert.deepEqual(
    dnis,
    [MARLENE, GINEZ].sort(),
    "18:50-20:30 lo dictan 2 docentes distintos",
  );
});

test("bloque ambiguo elige el primero por DNI, no el primero del dia", () => {
  const dni = elegirDocente({ slots: HORARIO, minutos: 19 * 60 });
  assert.equal(dni, [MARLENE, GINEZ].sort()[0]);
});

test("la eleccion no depende del orden en que llegan los slots", () => {
  const alReves = [...HORARIO].reverse();
  assert.equal(
    elegirDocente({ slots: alReves, minutos: 19 * 60 }),
    elegirDocente({ slots: HORARIO, minutos: 19 * 60 }),
  );
});

test("hora fuera de todo bloque devuelve null", () => {
  assert.deepEqual(docentesDelBloque({ slots: HORARIO, minutos: 12 * 60 }), []);
  assert.equal(elegirDocente({ slots: HORARIO, minutos: 12 * 60 }), null);
});

test("sin slots devuelve null", () => {
  assert.equal(elegirDocente({ slots: [], minutos: 20 * 60 }), null);
});

console.log("\n== bloque de una sesion ya existente (c_tema) ==");

const TEORIA = claveVentana(HORARIO[0]!); // 17:10-18:50
const PRACTICA = claveVentana(HORARIO[1]!); // 18:50-20:30

test("ubica los c_tema reales de PMHU1031 en su bloque", () => {
  const casos: [string, string][] = [
    ["[AUTO] PMHU1031-N1 (Vie 2026-07-10 20:10 - Doc. 23986303)", PRACTICA],
    ["[AUTO] PMHU1031-N1 (Vie 2026-07-17 20:11 - Doc. 23986303)", PRACTICA],
    ["[AUTO] PMHU1031-N1 (Vie 2026-07-24 18:52 - Doc. 23986303)", PRACTICA],
    ["[AUTO] PMHU1031-N2 (Vie 2026-07-10 17:02 - Doc. 23986303)", TEORIA],
    ["[AUTO] PMHU1031-N2 (Vie 2026-07-17 17:15 - Doc. 23986303)", TEORIA],
    ["[AUTO] PMHU1031-N2 (Vie 2026-07-24 17:13 - Doc. 23986303)", TEORIA],
  ];

  for (const [tema, esperado] of casos) {
    assert.equal(
      claveBloqueDeTema(tema, del(MARLENE)),
      esperado,
      `tema: ${tema}`,
    );
  }
});

test("18:52 va a la practica, no a la teoria que termina 18:50", () => {
  // Solo 2 min despues del fin de 17:10-18:50: gana el bloque mas cercano.
  assert.equal(
    claveBloqueDeTema("[AUTO] X (Vie 2026-07-24 18:52 - Doc. Y)", del(MARLENE)),
    PRACTICA,
  );
});

test("17:02 va a la teoria aunque arranco 8 min antes", () => {
  assert.equal(
    claveBloqueDeTema("[AUTO] X (Vie 2026-07-10 17:02 - Doc. Y)", del(MARLENE)),
    TEORIA,
  );
});

test("tema sin hora devuelve null", () => {
  assert.equal(claveBloqueDeTema("Clase cargada a mano", del(MARLENE)), null);
  assert.equal(claveBloqueDeTema(null, del(MARLENE)), null);
  assert.equal(claveBloqueDeTema(undefined, del(MARLENE)), null);
});

test("tema con hora lejos de todo bloque devuelve null", () => {
  assert.equal(
    claveBloqueDeTema("[AUTO] X (Vie 2026-07-10 11:57 - Doc. Y)", del(MARLENE)),
    null,
  );
});

test("los dos bloques de N1 tienen claves distintas", () => {
  assert.notEqual(TEORIA, PRACTICA);
});

console.log("\n== tardanza contra el horario programado ==");

// Bloque de las 8:00 a las 9:40, con la reunion arrancando 7:30.
const CLASE_8 = slot("M1", MARLENE, "08", "00", "09", "40");
const SALA_ABIERTA_730 = new Date("2026-07-17T12:30:00.000Z"); // 07:30 Lima
const TOLERANCIA = 15;

const limaEn = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return desdeMinutosLima(SALA_ABIERTA_730, h! * 60 + m!);
};

test("desdeMinutosLima ubica una hora del dia de Lima", () => {
  const d = desdeMinutosLima(new Date("2026-07-18T01:11:36.000Z"), 18 * 60 + 50);
  assert.equal(d.toISOString(), "2026-07-17T23:50:00.000Z");
  assert.equal(horaMinLima(d), "18:50");
  assert.equal(fechaLima(d), "2026-07-17");
});

test("inicioProgramadoSlot da la hora del horario, no la de la sala", () => {
  const inicio = inicioProgramadoSlot(CLASE_8, SALA_ABIERTA_730);
  assert.ok(inicio);
  assert.equal(horaMinLima(inicio!), "08:00");
});

test("inicioProgramadoSlot devuelve null si el slot no tiene hora", () => {
  const roto = slot("M9", MARLENE, "", "", "", "");
  assert.equal(inicioProgramadoSlot(roto, SALA_ABIERTA_730), null);
});

test("BUG REPORTADO: clase 8:00, sala 7:30, alumno 8:05 -> puntual", () => {
  const inicio = inicioProgramadoSlot(CLASE_8, SALA_ABIERTA_730)!;

  assert.equal(
    esTardanza({
      firstJoin: limaEn("08:05"),
      referencia: inicio,
      toleranciaMin: TOLERANCIA,
    }),
    false,
  );

  // Con la referencia vieja (apertura de sala) daba tardanza: 35 > 15.
  assert.equal(
    esTardanza({
      firstJoin: limaEn("08:05"),
      referencia: SALA_ABIERTA_730,
      toleranciaMin: TOLERANCIA,
    }),
    true,
    "asi se comportaba antes del fix",
  );
});

test("el limite de tolerancia es exclusivo", () => {
  const inicio = inicioProgramadoSlot(CLASE_8, SALA_ABIERTA_730)!;
  const caso = (hhmm: string) =>
    esTardanza({
      firstJoin: limaEn(hhmm),
      referencia: inicio,
      toleranciaMin: TOLERANCIA,
    });

  assert.equal(caso("08:14"), false);
  assert.equal(caso("08:15"), false, "15 min justos entran en la tolerancia");
  assert.equal(caso("08:16"), true);
});

test("llegar antes de la hora nunca es tardanza", () => {
  const inicio = inicioProgramadoSlot(CLASE_8, SALA_ABIERTA_730)!;
  assert.equal(
    esTardanza({
      firstJoin: limaEn("07:35"),
      referencia: inicio,
      toleranciaMin: TOLERANCIA,
    }),
    false,
  );
});

test("llegar muy tarde sigue siendo tardanza", () => {
  const inicio = inicioProgramadoSlot(CLASE_8, SALA_ABIERTA_730)!;
  assert.equal(
    esTardanza({
      firstJoin: limaEn("08:40"),
      referencia: inicio,
      toleranciaMin: TOLERANCIA,
    }),
    true,
  );
});

test("sin firstJoin o sin referencia devuelve null, no false", () => {
  const inicio = inicioProgramadoSlot(CLASE_8, SALA_ABIERTA_730)!;
  assert.equal(
    esTardanza({ firstJoin: null, referencia: inicio, toleranciaMin: TOLERANCIA }),
    null,
  );
  assert.equal(
    esTardanza({
      firstJoin: limaEn("08:05"),
      referencia: null,
      toleranciaMin: TOLERANCIA,
    }),
    null,
  );
});

test("tardanza en el bloque real de PMHU1031 18:50-20:30", () => {
  const inicio = inicioProgramadoSlot(HORARIO[1]!, SALA_ABIERTA_730)!;
  assert.equal(horaMinLima(inicio), "18:50");

  const caso = (hhmm: string) =>
    esTardanza({
      firstJoin: limaEn(hhmm),
      referencia: inicio,
      toleranciaMin: TOLERANCIA,
    });

  assert.equal(caso("18:45"), false, "entro antes de que empiece");
  assert.equal(caso("19:02"), false, "12 min, dentro de tolerancia");
  assert.equal(caso("19:14"), true, "24 min");
  assert.equal(caso("20:11"), true);
});

console.log("\n== resolucion final de grupos ==");

test("BUG REPORTADO: 20:11 practica N1 no debe generar N2", () => {
  const sel = resolverGruposSesion({
    slots: del(MARLENE),
    minutos: 20 * 60 + 11,
  });
  assert.deepEqual(gruposDeSlots(sel), ["N1"]);
});

test("teoria compartida 17:13 genera N1 y N2", () => {
  const sel = resolverGruposSesion({
    slots: del(MARLENE),
    minutos: 17 * 60 + 13,
  });
  assert.deepEqual(gruposDeSlots(sel), ["N1", "N2"]);
});

test("practica de N2 18:41 genera solo N2", () => {
  const sel = resolverGruposSesion({ slots: del(GINEZ), minutos: 18 * 60 + 41 });
  assert.deepEqual(gruposDeSlots(sel), ["N2"]);
});

test("hora fuera de todo bloque no genera sesiones", () => {
  const sel = resolverGruposSesion({
    slots: del(MARLENE),
    minutos: 11 * 60 + 57,
  });
  assert.deepEqual(sel, []);
});

test("dia sin clases no genera sesiones", () => {
  // getHorarioGrupo ya filtra por n_numdia: otro dia llega como lista vacia.
  assert.deepEqual(resolverGruposSesion({ slots: [], minutos: 20 * 60 }), []);
});

console.log(`\n${ok} tests ok${process.exitCode ? " (con fallas)" : ""}\n`);
