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

  ZOOM: {
    BASE_URL: base.ZOOM_API_BASE,
    ACCOUNT_ID: base.ZOOM_OAUTH_ACCOUNT_ID,
    CLIENT_ID: base.ZOOM_OAUTH_CLIENT_ID,
    CLIENT_SECRET: base.ZOOM_OAUTH_CLIENT_SECRET,
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
