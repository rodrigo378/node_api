// src/modules/zoom/horario.ts
//
// Resolucion de "a que bloque del horario pertenece esta reunion de Zoom".
//
// El problema que resuelve: tb_cur_grp_hor tiene una fila por bloque horario
// (curso + grupo + docente + dia + hora). Filtrar solo por courseid + dia +
// docente devuelve TODOS los grupos que ese docente dicta ese dia, asi que una
// reunion de 18:50-20:30 terminaba generando asistencia tambien para grupos que
// solo tienen clase 17:10-18:50.
//
// Aca se decide, en funciones puras y testeables, usando como unica señal la
// hora real en que arranco la reunion:
//   1. que bloque horario le corresponde,
//   2. que grupos dicta ese bloque,
//   3. que docente lo dicta.
//
// La agenda del meeting queda deliberadamente fuera: la escriben los docentes a
// mano y no siempre esta.
//
// Tests: src/testing/test-horario.ts (npm run test:horario)

import { desdeMinutosLima } from "../../core/utils/time";

export type SlotHorario = {
  c_grpcur: string;
  c_dnidoc: string;
  c_hh_ini: string | number | null;
  c_mi_ini: string | number | null;
  c_hh_fin: string | number | null;
  c_mi_fin: string | number | null;
  [extra: string]: unknown;
};

/**
 * Minutos de holgura entre el inicio real de la reunion y su bloque horario.
 *
 * Los docentes abren la sala antes o despues de la hora. Con 45 min se cubre el
 * caso real de una practica de 18:50 abierta 18:41, sin llegar a alcanzar el
 * bloque anterior (los bloques de esta universidad son de 100 min).
 */
export const TOLERANCIA_SLOT_MIN = 45;

// ===================================================================================
// Ventanas horarias
// ===================================================================================

function aMinutos(hh: unknown, mi: unknown): number {
  const textoHh = String(hh ?? "").trim();
  if (textoHh === "") return NaN;

  const h = Number(textoHh);
  const m = Number(String(mi ?? "0").trim() || "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;

  return h * 60 + m;
}

/**
 * Bloque horario del slot expresado en minutos desde medianoche.
 * ini/fin salen NaN si el horario de SIGU esta incompleto o invertido.
 */
export function ventanaSlot(slot: SlotHorario): { ini: number; fin: number } {
  const ini = aMinutos(slot.c_hh_ini, slot.c_mi_ini);
  const fin = aMinutos(slot.c_hh_fin, slot.c_mi_fin);

  if (!Number.isFinite(ini)) return { ini: NaN, fin: NaN };
  if (!Number.isFinite(fin) || fin <= ini) return { ini, fin: NaN };

  return { ini, fin };
}

function ventanaValida(v: { ini: number; fin: number }): boolean {
  return Number.isFinite(v.ini) && Number.isFinite(v.fin);
}

/** Identificador del bloque. Dos slots con la misma clave son la misma clase. */
export function claveVentana(slot: SlotHorario): string {
  const { ini, fin } = ventanaSlot(slot);
  return `${ini}-${fin}`;
}

/**
 * Minutos entre `minutos` y el bloque del slot. 0 si esta dentro.
 *
 * El limite superior es exclusivo: a las 18:50 la reunion pertenece al bloque
 * 18:50-20:30, no al 17:10-18:50 que acaba de terminar.
 */
export function distanciaAVentana(slot: SlotHorario, minutos: number): number {
  const v = ventanaSlot(slot);
  if (!ventanaValida(v)) return Number.POSITIVE_INFINITY;

  if (minutos >= v.ini && minutos < v.fin) return 0;
  return minutos < v.ini ? v.ini - minutos : minutos - v.fin + 1;
}

/**
 * Devuelve los slots del bloque horario que corresponde a `minutos`.
 *
 * Elige el bloque mas cercano dentro de la tolerancia y devuelve TODOS los slots
 * de ese mismo bloque (una teoria compartida N1-N2 son dos filas con la misma
 * ventana). Si nada cae dentro de la tolerancia devuelve [], para no inventar
 * una clase que el horario no respalda.
 */
export function seleccionarSlotsPorHora<T extends SlotHorario>(
  slots: T[],
  minutos: number,
  toleranciaMin: number = TOLERANCIA_SLOT_MIN,
): T[] {
  if (!slots.length) return [];

  const conDistancia = slots
    .map((slot) => ({ slot, dist: distanciaAVentana(slot, minutos) }))
    .filter((c) => Number.isFinite(c.dist));

  if (!conDistancia.length) return [];

  const minDist = Math.min(...conDistancia.map((c) => c.dist));
  if (minDist > toleranciaMin) return [];

  // Empate entre bloques distintos: gana el que empieza mas temprano.
  const clave = conDistancia
    .filter((c) => c.dist === minDist)
    .sort((a, b) => ventanaSlot(a.slot).ini - ventanaSlot(b.slot).ini)
    .map((c) => claveVentana(c.slot))[0];

  return slots.filter((s) => claveVentana(s) === clave);
}

/**
 * Bloque al que pertenece una sesion ya existente de tb_asis_alum, deducido de
 * la hora que createSesiones deja en c_tema ("... (Vie 2026-07-17 20:11 - Doc. X)").
 *
 * Hace falta porque tb_asis_alum no tiene columna de hora: sin esto, la teoria y
 * la practica del mismo grupo el mismo dia son indistinguibles y el dedupe por
 * (grupo, fecha, docente) descarta la segunda.
 *
 * Devuelve null si el tema no trae hora (sesion cargada a mano): quien llama
 * tiene que tratarlo como "no ubicable" y no duplicar.
 */
export function claveBloqueDeTema(
  tema: string | null | undefined,
  slotsDelDia: SlotHorario[],
  toleranciaMin?: number,
): string | null {
  const match = /(\d{1,2}):(\d{2})/.exec(String(tema ?? ""));
  if (!match) return null;

  const minutos = Number(match[1]) * 60 + Number(match[2]);
  const bloque = seleccionarSlotsPorHora(slotsDelDia, minutos, toleranciaMin);

  return bloque[0] ? claveVentana(bloque[0]) : null;
}

// ===================================================================================
// Docente y grupos del bloque
// ===================================================================================

function dnisUnicos(slots: SlotHorario[]): string[] {
  return [
    ...new Set(
      slots.map((s) => String(s.c_dnidoc ?? "").trim()).filter(Boolean),
    ),
  ];
}

/** Grupos distintos presentes en los slots, ordenados. */
export function gruposDeSlots(slots: SlotHorario[]): string[] {
  return [
    ...new Set(
      slots.map((s) => String(s.c_grpcur ?? "").trim()).filter(Boolean),
    ),
  ].sort();
}

/**
 * Docentes que dictan el bloque horario de la reunion, ordenados por DNI.
 *
 * Mas de uno significa que el horario no alcanza para saber quien dicto: la sala
 * de Zoom es una cuenta compartida (sala15@, sala16@), asi que el host no
 * identifica a la persona, y dos docentes pueden dictar el mismo curso en el
 * mismo bloque para grupos distintos. Devolver la lista completa deja que quien
 * llama decida y registre la ambiguedad.
 */
export function docentesDelBloque(params: {
  slots: SlotHorario[];
  minutos: number;
  toleranciaMin?: number;
}): string[] {
  const { slots, minutos, toleranciaMin } = params;

  const candidatos = dnisUnicos(slots);
  if (candidatos.length <= 1) return candidatos;

  return dnisUnicos(
    seleccionarSlotsPorHora(slots, minutos, toleranciaMin),
  ).sort();
}

/**
 * DNI del docente que dicto la reunion, o null si la reunion no cae en ningun
 * bloque del horario.
 *
 * Si el bloque lo dictan varios docentes devuelve el primero por DNI. Es
 * arbitrario, pero acotado al bloque correcto: antes se caia a `docentes[0]` de
 * TODO el dia porque comparaba `start_time.getHours()` contra `c_hh_ini` por
 * igualdad exacta, y una reunion abierta 20:11 nunca igualaba un bloque que
 * empieza 18:50. Usar docentesDelBloque para detectar el caso ambiguo y loguearlo.
 */
export function elegirDocente(params: {
  slots: SlotHorario[];
  minutos: number;
  toleranciaMin?: number;
}): string | null {
  return docentesDelBloque(params)[0] ?? null;
}

// ===================================================================================
// Tardanza respecto al horario programado
// ===================================================================================

/**
 * Instante en que la clase DEBIA empezar, segun el horario.
 *
 * `referencia` solo aporta el dia civil (normalmente el start_time de la
 * reunion). null si el slot no tiene hora valida.
 */
export function inicioProgramadoSlot(
  slot: SlotHorario,
  referencia: Date,
): Date | null {
  const { ini } = ventanaSlot(slot);
  if (!Number.isFinite(ini)) return null;

  return desdeMinutosLima(referencia, ini);
}

/**
 * Momento desde el que se cuenta la tardanza: la mas tardia entre la hora
 * programada de la clase y la apertura de la sala.
 *
 * Las dos referencias por separado fallan en un sentido distinto:
 *   - Solo la apertura de la sala: clase 8:00, sala abierta 7:30, alumno 8:05
 *     daba 35 min y quedaba con tardanza aunque llego antes de su clase.
 *   - Solo el horario: clase 8:00, sala abierta 8:20, alumno 8:25 daba 25 min y
 *     quedaba con tardanza aunque entro apenas la sala existio.
 *
 * Tomar la mayor cubre las dos: si el docente abrio antes manda el horario, si
 * abrio tarde manda la apertura.
 */
export function referenciaTardanza(params: {
  inicioProgramado: Date | null | undefined;
  aperturaSala: Date | null | undefined;
}): Date | null {
  const { inicioProgramado, aperturaSala } = params;

  if (inicioProgramado && aperturaSala) {
    return new Date(
      Math.max(inicioProgramado.getTime(), aperturaSala.getTime()),
    );
  }

  return inicioProgramado ?? aperturaSala ?? null;
}

/**
 * Si el alumno llego tarde. `referencia` sale de referenciaTardanza().
 *
 * Devuelve null, no false, cuando falta algun dato: "no se pudo determinar" no
 * es lo mismo que "llego puntual".
 */
export function esTardanza(params: {
  firstJoin: Date | null | undefined;
  referencia: Date | null | undefined;
  toleranciaMin: number;
}): boolean | null {
  const { firstJoin, referencia, toleranciaMin } = params;
  if (!firstJoin || !referencia) return null;

  const diffMs = new Date(firstJoin).getTime() - referencia.getTime();
  return diffMs > toleranciaMin * 60 * 1000;
}

/**
 * Slots que deben generar sesion de asistencia para esta reunion.
 *
 * Recorta el horario del docente al bloque en que arranco la reunion. []
 * significa "esta reunion no corresponde a ningun bloque del horario": no hay
 * que crear nada.
 */
export function resolverGruposSesion<T extends SlotHorario>(params: {
  slots: T[];
  minutos: number;
  toleranciaMin?: number;
}): T[] {
  const { slots, minutos, toleranciaMin } = params;
  return seleccionarSlotsPorHora(slots, minutos, toleranciaMin);
}
