// src/core/utils/time.ts
//
// Helpers de hora civil de Lima (UTC-5, sin horario de verano).
//
// Zoom entrega y guarda todo en UTC. SIGU razona en hora local.
// Todas estas funciones derivan la hora local del offset fijo, no del
// timezone del proceso, para que el resultado sea el mismo en un server
// en UTC que en una laptop en America/Lima.

export const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Devuelve un Date desplazado para que sus getters UTC representen la
 * hora civil de Lima. Solo para leer con getUTC* / toISOString.
 */
export function aHoraLima(fecha: Date): Date {
  return new Date(fecha.getTime() - LIMA_OFFSET_MS);
}

/** Fecha civil de Lima en formato YYYY-MM-DD. */
export function fechaLima(fecha: Date): string {
  return aHoraLima(fecha).toISOString().slice(0, 10);
}

/** Hora civil de Lima en formato HH:MM. */
export function horaMinLima(fecha: Date): string {
  return aHoraLima(fecha).toISOString().slice(11, 16);
}

/** Dia de la semana en Lima: 0 domingo .. 6 sabado (igual que n_numdia de SIGU). */
export function diaSemanaLima(fecha: Date): number {
  return aHoraLima(fecha).getUTCDay();
}

/** Minutos transcurridos desde la medianoche de Lima. */
export function minutosDiaLima(fecha: Date): number {
  const d = aHoraLima(fecha);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Instante absoluto de una hora del dia de Lima, tomando el dia civil de
 * `referencia`.
 *
 * Sirve para convertir un bloque del horario (que SIGU guarda como hora del dia
 * suelta) en un Date comparable contra los tiempos de Zoom, que son absolutos.
 *
 * desdeMinutosLima(2026-07-18T01:11Z, 1130) -> 2026-07-17T23:50Z  (18:50 en Lima)
 */
export function desdeMinutosLima(referencia: Date, minutosDia: number): Date {
  const lima = aHoraLima(referencia);

  const medianocheLima = Date.UTC(
    lima.getUTCFullYear(),
    lima.getUTCMonth(),
    lima.getUTCDate(),
  );

  return new Date(medianocheLima + minutosDia * 60_000 + LIMA_OFFSET_MS);
}

/** Nombre corto del dia, indexado por diaSemanaLima. */
export const DIAS_SEMANA = [
  "Dom",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
] as const;

/** Nombre corto del dia en Lima. */
export function diaTextoLima(fecha: Date): string {
  return DIAS_SEMANA[diaSemanaLima(fecha)] ?? "";
}
