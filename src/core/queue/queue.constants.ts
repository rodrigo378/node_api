// core/queue/queue.constants.ts

// Nombres de las colas que procesa este worker
export const ZOOM_QUEUE = "zoom";
export const HUBSPOT_QUEUE = "hubspot";
export const TI_QUEUE = "ti";
export const HEALTH_QUEUE = "health";
export const MAIN_QUEUE = "main";

// Acciones de health (lo que llega en job.data.action)
export const HEALTH_ACTIONS = {
  PING: "ping",
  FULL: "full",
} as const;

export type HealthAction = (typeof HEALTH_ACTIONS)[keyof typeof HEALTH_ACTIONS];

// Acciones de Zoom (lo que llega en job.data.action)
export const ZOOM_ACTIONS = {
  SYNC_USERS: "sync_users",
  SYNC_MEETINGS_ROOMS: "sync_meetings_rooms",
  SYNC_INSTANCES: "sync_instances",
  SYNC_PARTICIPANTS_RAW: "sync_participants_raw",
  SYNC_PARTICIPANTS: "sync_participants",
  SYNC_ASISTENCIAS: "sync_asistencias",
} as const;

export type ZoomAction = (typeof ZOOM_ACTIONS)[keyof typeof ZOOM_ACTIONS];

// Acciones de Hubspot
export const HUBSPOT_ACTIONS = {
  SYNC_COMPLETA: "sync_completa",
} as const;

export type HubspotAction =
  (typeof HUBSPOT_ACTIONS)[keyof typeof HUBSPOT_ACTIONS];

// Acciones de ti
export const TI_ACTIONS = {
  TI_TEST: "ti_test",
  SINC_MASIVO: "sinc_masivo",
} as const;

export type TiAction = (typeof TI_ACTIONS)[keyof typeof TI_ACTIONS];

export const MAIL_ACTIONS = {
  SEND: "send",
} as const;

export type MailAction = (typeof MAIL_ACTIONS)[keyof typeof MAIL_ACTIONS];
