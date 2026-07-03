# Handoff — Cola `ti` (sincronización SIGU ↔ Moodle)

Cómo el **back** dispara la sincronización de matrículas/docentes entre SIGU y Moodle
encolando jobs en la cola `ti`. Soporta ejecución **manual** y **automática (scheduler)**.

---

## 1. Conexión

Mismo Redis que el worker:

```
REDIS_HOST=...
REDIS_PORT=...
REDIS_PASSWORD=...        # opcional
```

- **Cola:** `ti`
- **Concurrencia del worker:** 2
- Dentro de un batch, los cursos se procesan con concurrencia interna 6.

---

## 2. Acciones disponibles

El handler enruta por `job.data.action` ([ti.handler.ts](src/modules/ti/ti.handler.ts)).

| action | Qué hace |
|--------|----------|
| `sinc_masivo` | Sincroniza una lista de cursos (SIGU → Moodle: matricula/suspende alumnos y docentes) |
| `ti_test` | Job de prueba; devuelve eco del contexto (no toca datos) |

---

## 3. `sinc_masivo` — los 2 modos

La diferencia la marca `source`:

### Modo MANUAL — el back manda los cursos

```jsonc
{
  "action": "sinc_masivo",
  "source": "manual",
  "payload": {
    "courseids": [5895, 5896, 5897]   // también acepta "courseIds"
  },
  "meta": { "usuario_id": 123 },      // opcional (auditoría)
  "traceId": "uuid-opcional"
}
```

- Toma los cursos de `payload.courseids` (o `payload.courseIds`).
- Si la lista viene vacía → error: *"No se recibieron courseIds/courseids para ejecución manual."*

### Modo AUTOMÁTICO — los cursos salen de la config del schedule

```jsonc
{
  "action": "sinc_masivo",
  "source": "scheduler",
  "schedule_id": 42,                  // requerido en este modo
  "traceId": "uuid-opcional"
}
```

- **No** manda cursos en el payload. El worker lee los `courseid` de `sch_schedule_item`
  (BD `API_2`) para ese `schedule_id`.
- Requiere `schedule_id`; si falta → *"No se recibió schedule_id para ejecución scheduler."*
- Si el `schedule_id` no existe o no tiene cursos → falla con mensaje claro (id desincronizado
  vs sin cursos configurados).

> **Importante:** el `schedule_id` del job debe coincidir con el de la BD (`sch_schedule` /
> `sch_schedule_item`). Es la llave que relaciona el schedule con su lista de cursos.

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

const tiQueue = new Queue("ti", { connection });

// Manual
export async function sincronizarCursos(courseids: number[], usuarioId?: number) {
  return tiQueue.add("sinc_masivo", {
    action: "sinc_masivo",
    source: "manual",
    payload: { courseids },
    meta: { usuario_id: usuarioId },
    traceId: randomUUID(),
  });
}

// Automático (normalmente lo dispara el scheduler, no el back)
export async function sincronizarPorSchedule(scheduleId: number) {
  return tiQueue.add("sinc_masivo", {
    action: "sinc_masivo",
    source: "scheduler",
    schedule_id: scheduleId,
    traceId: randomUUID(),
  });
}
```

---

## 5. Respuesta del job

```json
{
  "ok": true,
  "module": "ti",
  "action": "sinc_masivo",
  "source": "manual",
  "traceId": "…",
  "result": [
    { "courseid": 5895, "ok": true,  "data": { "alumnosSigu": 30, "nuevo": 2, "borrar": 1, "nuevoDocentes": 1, "borrarDocentes": 0 } },
    { "courseid": 5896, "ok": false, "error": "Los siguientes emails de SIGU no existen en Moodle: ..." }
  ]
}
```

`result` es un array **por curso**: un curso que falla **no tumba** el resto del batch;
devuelve `{ courseid, ok: false, error }` y sigue con los demás.

---

## 6. Saber si el automático está corriendo / último run / logs

Ya se registra en cada corrida (no hay que construir nada para leerlo):

**`sch_schedule`** (estado del schedule, BD `API_2`):

```sql
SELECT last_status, last_started_at, last_finished_at, last_duration_ms,
       last_error_message, total_runs, total_success, total_failed
FROM sch_schedule
WHERE id = :scheduleId;
```

- `last_status = 'processing'` → **está corriendo ahora**.
- `last_started_at` / `last_finished_at` → **cuándo fue el último**.

**`core_job_log`** (historial por job, BD `API_2`):

```sql
SELECT job_id, action, source, status, started_at, finished_at, duration_ms,
       error_message, payload_json, result_json
FROM core_job_log
WHERE schedule_id = :scheduleId        -- o queue_name = 'ti'
ORDER BY started_at DESC
LIMIT 20;
```

Distingue automático vs manual por la columna `source`.

---

## 7. Advertencia de concurrencia

Manual y automático usan la **misma cola** con `concurrency: 2`, así que **pueden correr a la
vez**. Si ambos tocan el **mismo `courseid`** simultáneamente hay riesgo de condición de
carrera en Moodle (doble matrícula / suspensión cruzada). Hoy no hay lock que lo impida:
evita disparar un `sinc_masivo` manual sobre cursos que el automático está procesando, o
pide implementar un lock por curso.
