// core/queue/health.handler.ts
//
// Handler de la cola "health". El back encola UN job { action: "ping" | "full" }
// y este handler devuelve el estado GENERAL del proceso: como los 3 workers
// (zoom, hubspot, ti) viven en el mismo proceso, con un solo job reporta las 3.

import type { Job } from "bullmq";
import type { DbRegistry } from "../db/registry";
import { HEALTH_ACTIONS } from "./queue.constants";

export type QueueStatus = {
  ready: boolean;
  running: boolean;
  paused: boolean;
  lastError: string | null;
};

export type WorkersStatus = Record<string, QueueStatus>;

async function checkDbs(db: DbRegistry) {
  const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> =
    {};

  for (const name of db.list()) {
    const startedAt = Date.now();
    try {
      await db.get(name).raw("SELECT 1 AS ok");
      checks[name] = { ok: true, latencyMs: Date.now() - startedAt };
    } catch (err) {
      checks[name] = {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return checks;
}

export function buildHealthHandler(
  getStatus: () => WorkersStatus,
  db?: DbRegistry,
) {
  return async (job: Job) => {
    const { action = HEALTH_ACTIONS.PING, traceId } = job?.data ?? {};

    const queues = getStatus();
    const workersOk = Object.values(queues).every((q) => q.ready && q.running);

    const base = {
      ok: workersOk,
      status: (workersOk ? "ACTIVO" : "DEGRADADO") as "ACTIVO" | "DEGRADADO",
      action,
      traceId,
      worker: "sigu",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      queues,
    };

    if (action === HEALTH_ACTIONS.FULL && db) {
      const checks = await checkDbs(db);
      const dbOk = Object.values(checks).every((c) => c.ok);
      const ok = workersOk && dbOk;
      return {
        ...base,
        ok,
        status: ok ? "ACTIVO" : "DEGRADADO",
        checks,
      };
    }

    return base;
  };
}
