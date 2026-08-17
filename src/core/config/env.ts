import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// ===================================================================================
const BaseEnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  DB_NAMES: z.string().min(1, "Falta DB_NAMES (ej: DB_NAMES=API_2,FINANZAS)"),

  ZOOM_OAUTH_ACCOUNT_ID: z.string(),
  ZOOM_OAUTH_CLIENT_ID: z.string(),
  ZOOM_OAUTH_CLIENT_SECRET: z.string(),
  ZOOM_API_BASE: z.string(),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional(),

  HUBSPOT_API_BASE: z.string(),
  HUBSPOT_TOKEN: z.string(),

  BASE_MOODLE: z.string(),
  TOKEN_MOODLE: z.string(),

  CORREO_OUTLOOK: z.string().optional(),
  CLAVE_CORREO: z.string().optional(),
  CORREO_HOST: z.string().default("smtp.office365.com"),
  CORREO_PORT: z.coerce.number().default(587),
  CORREO_NOMBRE: z.string().default("Mesa de Ayuda UMA"),
});

const base = BaseEnvSchema.parse(process.env);

// ===================================================================================
const names = base.DB_NAMES.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ConnSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().default(3306),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
});

export type DbConn = z.infer<typeof ConnSchema>;

// ===================================================================================
export const env = {
  PORT: base.PORT,
  HOST: base.HOST,

  HUBSPOT: {
    TOKEN: base.HUBSPOT_TOKEN,
    BASE_URL: base.HUBSPOT_API_BASE,
  },

  ZOOM: {
    BASE_URL: base.ZOOM_API_BASE,
    ACCOUNT_ID: base.ZOOM_OAUTH_ACCOUNT_ID,
    CLIENT_ID: base.ZOOM_OAUTH_CLIENT_ID,
    CLIENT_SECRET: base.ZOOM_OAUTH_CLIENT_SECRET,
  },

  REDIS: {
    HOST: base.REDIS_HOST,
    PORT: base.REDIS_PORT,
    PASSWORD: base.REDIS_PASSWORD,
  },

  TI: {
    BASE_MOODLE: base.BASE_MOODLE,
    TOKEN_MOODLE: base.TOKEN_MOODLE,
  },

  MAIL: {
    HOST: base.CORREO_HOST,
    PORT: base.CORREO_PORT,
    USER: base.CORREO_OUTLOOK,
    PASSWORD: base.CLAVE_CORREO,
    FROM_NAME: base.CORREO_NOMBRE,
  },

  DB_CONNECTIONS: names.map((name) =>
    ConnSchema.parse({
      name,
      host: process.env[`DB_${name}_HOST`],
      port: process.env[`DB_${name}_PORT`],
      database: process.env[`DB_${name}_DATABASE`],
      user: process.env[`DB_${name}_USER`],
      password: process.env[`DB_${name}_PASSWORD`],
    }),
  ) as DbConn[],
};
