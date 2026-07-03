# Handoff — Cola `zoom`

Cómo el **back** dispara sincronizaciones de Zoom encolando jobs en la cola `zoom`
del `worker-sync` (BullMQ sobre Redis). No hay endpoint HTTP: todo se dispara por cola.

---

## 1. Conexión

Mismo Redis que el worker:

```
REDIS_HOST=...
REDIS_PORT=...
REDIS_PASSWORD=...        # opcional
```

- **Cola:** `zoom`
- **Concurrencia del worker:** 2 (pueden correr 2 jobs de zoom a la vez)

---

## 2. Acciones disponibles

El handler enruta por `job.data.action` ([zoom.handler.ts](src/modules/zoom/zoom.handler.ts)).
Ninguna requiere payload; solo `action` (y opcional `traceId` para rastrear).

| action | Qué hace |
|--------|----------|
| `sync_users` | Sincroniza usuarios de Zoom |
| `sync_meetings_rooms` | Sincroniza meetings / rooms |
| `sync_instances` | Sincroniza instancias de meetings |
| `sync_participants_raw` | Trae participantes crudos (raw) |
| `sync_participants` | Procesa participantes |
| `sync_asistencias` | Calcula/sincroniza asistencias |

> El orden típico del pipeline es: `sync_instances` → `sync_participants_raw` →
> `sync_participants` → `sync_asistencias`. Confirma la secuencia con el equipo de datos.

---

## 3. Payload

```jsonc
{
  "action": "sync_users",     // requerido (uno de la tabla)
  "traceId": "uuid-opcional"  // opcional, para correlacionar en logs
}
```

Si falta `action`, el job falla con: `Falta action en job.data (zoom)`.

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

const zoomQueue = new Queue("zoom", { connection });

export async function dispararZoom(action: string) {
  return zoomQueue.add(action, { action, traceId: randomUUID() });
}

// ejemplo
await dispararZoom("sync_users");
```

> Reutiliza **una sola** instancia de `Queue` (no crear por request) y ciérrala al
> apagar el back con `await zoomQueue.close()`.

Si necesitas **esperar el resultado** (no solo encolar), usa `QueueEvents` +
`job.waitUntilFinished(events, timeoutMs)` — ver ejemplo en `HANDOFF_HEALTH.md`.
Ojo: estas sincronizaciones pueden tardar, así que normalmente se disparan
*fire-and-forget* y el estado se consulta por logs (ver `HANDOFF_TI.md`, sección de logs).

---

## 5. Respuesta del job

```json
{
  "ok": true,
  "module": "zoom",
  "action": "sync_users",
  "traceId": "…",
  "result": { }
}
```

Si falla, el job queda en estado `failed` en BullMQ y el error se registra en la
tabla `core_job_log` (columna `error_message`).
