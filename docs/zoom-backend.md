# Zoom – Referencia para el Backend

Este worker **no expone funciones directas**. El backend dispara el trabajo
**encolando jobs en una cola BullMQ** y el worker los ejecuta según
`job.data.action`.

## Cómo se dispara

- **Cola (BullMQ / Redis):** `"zoom"`
- **Forma del job:** el backend agrega un job con este `data`:

```ts
// job.data
{
  action: string;    // requerido: cuál etapa ejecutar (ver tabla)
  traceId?: string;  // opcional: para rastrear el job en logs
  periodo?: number;  // opcional: solo aplica a sync_asistencias (ej. 20261, 20262)
}
```

Ejemplo (productor con BullMQ):

```ts
import { Queue } from "bullmq";

const zoomQueue = new Queue("zoom", { connection: redisConnection });

await zoomQueue.add("sync", {
  action: "sync_asistencias",
  periodo: 20262,          // opcional
  traceId: "req-123",      // opcional
});
```

> El worker corre con **concurrencia 2** en la cola `"zoom"`.

---

## Acciones disponibles (pipeline)

Se ejecutan **en este orden**. Cada etapa consume lo que produjo la anterior.

| # | `action` | Función | Depende de | Parámetros |
|---|----------|---------|------------|------------|
| 1 | `sync_users` | `sincronizarUsuarios()` | — | — |
| 2 | `sync_meetings_rooms` | `sincronizarMeetingsRooms()` | 1 | — |
| 3 | `sync_instances` | `sincronizarInstancias()` | 2 | — |
| 4 | `sync_participants_raw` | `sincronizarParticipantesRaw()` | 3 | — |
| 5 | `sync_participants` | `sincronizarParticipantes()` | 4 | — |
| 6 | `sync_asistencias` | `sincronizarAsistencias(periodo?)` | 5 | `periodo?: number` |

---

## Detalle de cada etapa

### 1. `sync_users` — `sincronizarUsuarios()`
- **Qué hace:** trae todos los usuarios/salas desde la API de Zoom y los
  guarda/actualiza en la tabla `zoom_user` (API_2).
- **Lee:** API Zoom (users).
- **Escribe:** `zoom_user`.
- **Parámetros:** ninguno.

### 2. `sync_meetings_rooms` — `sincronizarMeetingsRooms()`
- **Qué hace:** por cada sala activa, trae sus reuniones desde Zoom, resuelve
  el `courseid` a partir del `shortname` (cruce con `tb_curso_grupo_sincro`) y
  guarda reuniones y sus ocurrencias.
- **Lee:** `zoom_user` (activos) + API Zoom (meetings/detalles).
- **Escribe:** `zoom_meeting`, `zoom_meeting_occurrence`.
- **Parámetros:** ninguno.
- **Notas:**
  - El `courseid` ya es único por periodo; el periodo se resuelve solo por el
    `shortname` → no requiere pasar periodo.
  - Si una reunión ya no existe en Zoom (404), la omite y continúa (no aborta).

### 3. `sync_instances` — `sincronizarInstancias()`
- **Qué hace:** por cada reunión guardada, trae sus instancias reales (sesiones
  que ocurrieron) desde Zoom.
- **Lee:** `zoom_meeting` + API Zoom (past meeting instances).
- **Escribe:** `zoom_meeting_instance`.
- **Parámetros:** ninguno.

### 4. `sync_participants_raw` — `sincronizarParticipantesRaw()`
- **Qué hace:** por cada instancia sin sincronizar, baja el reporte crudo de
  participantes desde Zoom.
- **Lee:** instancias no sincronizadas + API Zoom (report participants).
- **Escribe:** `zoom_meeting_participant_raw`.
- **Parámetros:** ninguno.

### 5. `sync_participants` — `sincronizarParticipantes()`
- **Qué hace:** procesa los participantes crudos, los cruza con matriculados,
  calcula asistencia/tarde según la configuración y los marca.
- **Lee:** `zoom_meeting_participant_raw`, matriculados (SIGU),
  `zoom_attendance_config`.
- **Escribe:** `zoom_meeting_participants`.
- **Parámetros:** ninguno.
- **Requisito:** debe existir **una fila** en `zoom_attendance_config`
  (campos: `gap`, `lateToleranceMinutes`, `minAttendancePercentage`, `minTime`).
  Si la tabla está vacía, esta etapa falla.

### 6. `sync_asistencias` — `sincronizarAsistencias(periodo?)`
- **Qué hace:** toma las instancias listas y **crea la asistencia en SIGU**
  (`tb_asis_alum` + `tb_asis_alum_det`).
- **Lee:** instancias `PENDING` (procesadas y sincronizadas), horarios/matrícula
  (SIGU).
- **Escribe:** `tb_asis_alum`, `tb_asis_alum_det` (base SIGU escritura).
- **Parámetros:**
  - `periodo?: number` — si se envía (ej. `20261` o `20262`), procesa **solo**
    las instancias de ese periodo. Si se omite, procesa **todos** los periodos
    pendientes.
- **Idempotencia / duplicados:**
  - Solo procesa instancias con `attendance_status = "PENDING"`.
  - Antes de insertar, valida si la sesión ya existe (curso+fecha+docente) y la
    omite marcándola `ALREADY_EXISTS`.
  - Las inserciones usan `ON DUPLICATE KEY UPDATE` (no-op) → requieren índices
    únicos en SIGU para garantizar que no haya duplicados
    (ver `docs/zoom-sigu-indices.sql` / coordinar con el DBA).

---

## Orquestación recomendada

Para una corrida completa, encolar en orden y esperar que cada job termine
antes del siguiente (o encolarlos con dependencias):

```
sync_users
  → sync_meetings_rooms
    → sync_instances
      → sync_participants_raw
        → sync_participants
          → sync_asistencias   (opcional: { periodo: 20262 })
```

Cada etapa es reentrante: si se vuelve a ejecutar, solo procesa lo pendiente
(no reprocesa lo ya marcado).

---

## Utilidad extra (no encolada aún)

`detectarSalasSimultaneas(source, minSimultaneas?)` — detecta salas con N o más
reuniones al mismo tiempo (choques de agenda). Hoy **solo se corre por script**
(`npm run test:salas`), no está expuesta como `action`. Si el back la necesita
como job, hay que agregarle una acción propia (ej. `detect_salas_simultaneas`).
