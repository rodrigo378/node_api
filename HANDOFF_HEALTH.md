# Handoff — Health check del worker-sync (por cola `health`)

Guía para que el **back** verifique si el `worker-sync` está corriendo. No hay endpoint HTTP:
se encola **un solo job** en la cola `health` y el worker responde con el estado **general**
de las 3 colas (`zoom`, `hubspot`, `ti`), porque todas corren en el mismo proceso.

---

## 1. Conexión

El back se conecta al **mismo Redis** que el worker (BullMQ). Mismas variables de entorno:

```
REDIS_HOST=...
REDIS_PORT=...
REDIS_PASSWORD=...        # opcional
```

- **Cola:** `health`
- **Payload:** `{ "action": "ping" }` o `{ "action": "full" }`

| action | Qué chequea | Cuándo usarlo |
|--------|-------------|---------------|
| `ping` | Solo estado de los workers (rápido) | Health check frecuente / liveness |
| `full` | Workers + `SELECT 1` a cada BD | Chequeo profundo / readiness |

---

## 2. Código para el back (Node + BullMQ)

```ts
import { Queue, QueueEvents } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

const healthQueue = new Queue("health", { connection });
const healthEvents = new QueueEvents("health", { connection });
await healthEvents.waitUntilReady();

/**
 * Devuelve el estado del worker-sync.
 * Si el worker está caído, el job nunca se procesa y salta el timeout → { ok: false }.
 */
export async function checkWorkerSync(action: "ping" | "full" = "ping") {
  try {
    const job = await healthQueue.add(
      "health",
      { action, traceId: crypto.randomUUID() },
      { removeOnComplete: true, removeOnFail: true },
    );

    // Espera el resultado (timeout en ms). Ajusta según tu SLA.
    const result = await job.waitUntilFinished(healthEvents, 5000);
    return result; // ver contrato en la sección 3
  } catch (err) {
    // timeout o error de Redis => worker caído / inaccesible
    return {
      ok: false,
      status: "CAIDO",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
```

> **Importante:** reutiliza una sola instancia de `Queue` y `QueueEvents` (no crees
> nuevas en cada request). Ciérralas al apagar el back con `await healthQueue.close()`
> y `await healthEvents.close()`.

---

## 3. Contrato de respuesta

### `ping`

```json
{
  "ok": true,
  "status": "ACTIVO",
  "action": "ping",
  "traceId": "…",
  "worker": "sigu",
  "uptimeSeconds": 3540,
  "timestamp": "2026-07-03T12:00:00.000Z",
  "queues": {
    "zoom":    { "ready": true, "running": true, "paused": false, "lastError": null },
    "hubspot": { "ready": true, "running": true, "paused": false, "lastError": null },
    "ti":      { "ready": true, "running": true, "paused": false, "lastError": null }
  }
}
```

### `full` (agrega `checks` de BDs)

```json
{
  "ok": true,
  "status": "ACTIVO",
  "action": "full",
  "worker": "sigu",
  "uptimeSeconds": 3540,
  "timestamp": "2026-07-03T12:00:00.000Z",
  "queues": { "zoom": { … }, "hubspot": { … }, "ti": { … } },
  "checks": {
    "API_2":        { "ok": true, "latencyMs": 12 },
    "SIGU_LECTURA": { "ok": true, "latencyMs": 8 },
    "SIGU_INSERT":  { "ok": false, "latencyMs": 5001, "error": "connect ETIMEDOUT" }
  }
}
```

### Tipos

```ts
type QueueStatus = {
  ready: boolean;    // el worker conectó a Redis (evento 'ready')
  running: boolean;  // el loop de consumo está activo
  paused: boolean;   // el worker está pausado
  lastError: string | null;
};

type HealthResponse = {
  ok: boolean;
  status: "ACTIVO" | "DEGRADADO";      // "CAIDO" lo pone el back ante timeout
  action: "ping" | "full";
  traceId?: string;
  worker: "sigu";
  uptimeSeconds: number;
  timestamp: string;                    // ISO
  queues: Record<"zoom" | "hubspot" | "ti", QueueStatus>;
  checks?: Record<string, { ok: boolean; latencyMs: number; error?: string }>; // solo en 'full'
};
```

---

## 4. Cómo interpretarlo en el back

| Situación | `ok` | `status` | Lectura |
|-----------|------|----------|---------|
| Todos los workers arriba (y BDs en `full`) | `true` | `ACTIVO` | Todo bien |
| Algún worker `ready:false` / `running:false`, o alguna BD falla | `false` | `DEGRADADO` | Revisar `queues` / `checks` |
| El job no responde antes del timeout | `false` | `CAIDO` | Proceso caído o Redis inaccesible |

Regla simple para tu monitor: **alertar si `ok === false`**. El detalle de qué falló está
en `queues` (por worker) y en `checks` (por BD).
