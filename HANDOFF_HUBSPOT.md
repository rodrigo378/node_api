# Handoff — Cola `hubspot`

Cómo el **back** dispara la sincronización de Hubspot encolando un job en la cola
`hubspot` del `worker-sync` (BullMQ sobre Redis). Sin endpoint HTTP.

---

## 1. Conexión

Mismo Redis que el worker:

```
REDIS_HOST=...
REDIS_PORT=...
REDIS_PASSWORD=...        # opcional
```

- **Cola:** `hubspot`
- **Concurrencia del worker:** 1 (procesa **un** job a la vez)
- **Locks largos:** `lockDuration` 30 min, `lockRenewTime` 15 min ([worker.ts](src/core/queue/worker.ts))

> Es un proceso **pesado y largo**. Con `concurrency: 1`, si ya hay un `sync_completa`
> corriendo, el siguiente **espera en cola** hasta que termine. No lo dispares en loop.

---

## 2. Acciones disponibles

El handler enruta por `job.data.action` ([hubspot.handler.ts](src/modules/hubspot/hubspot.handler.ts)).

| action | Qué hace |
|--------|----------|
| `sync_completa` | Corre la sincronización completa de Hubspot (`sincronizarHubspot`) |

---

## 3. Payload

```jsonc
{
  "action": "sync_completa",  // requerido
  "traceId": "uuid-opcional"  // opcional
}
```

Si falta `action`, el job falla con: `Falta action en job.data (hubspot)`.

---

## 4. Código para el back (Node + BullMQ)

```ts
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";

const connection = {
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

const hubspotQueue = new Queue("hubspot", { connection });

export async function dispararHubspot() {
  return hubspotQueue.add("sync_completa", {
    action: "sync_completa",
    traceId: randomUUID(),
  });
}
```

> **Fire-and-forget recomendado.** Por lo largo del proceso, no bloquees el back
> esperando el resultado; consulta el estado por logs (ver `HANDOFF_TI.md`, sección logs)
> filtrando `core_job_log` por `queue_name = 'hubspot'`.

Para evitar encolar dos veces mientras uno corre, puedes usar un `jobId` fijo:

```ts
await hubspotQueue.add(
  "sync_completa",
  { action: "sync_completa", traceId: randomUUID() },
  { jobId: "hubspot-sync-completa" }, // BullMQ ignora duplicados con el mismo id activo
);
```

---

## 5. Respuesta del job

```json
{
  "ok": true,
  "module": "hubspot",
  "action": "sync_completa",
  "traceId": "…",
  "result": { }
}
```
