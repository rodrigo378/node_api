import { Worker, QueueEvents } from "bullmq";
import type { Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { logger } from "../config/logger";
import type { DbRegistry } from "../db/registry";

import { buildJobLog } from "./job-execution-log.service";

// Zoom
import { ZoomHttpClient } from "../../modules/zoom/http";
import { ZoomRepository } from "../../modules/zoom/respository";
import { ZoomService } from "../../modules/zoom/service";
import { buildZoomHandler } from "../../modules/zoom/zoom.handler";

// Hubspot
import { HubspotHttpClient } from "../../modules/hubspot/http";
import { HubspotRepository } from "../../modules/hubspot/repository";
import { HubspotService } from "../../modules/hubspot/service";
import { buildHubspotHandler } from "../../modules/hubspot/hubspot.handler";
// Mail
import { MailService } from "../../modules/mail/service";
import { buildMailHandler } from "../../modules/mail/mail.handler";
import {
  HEALTH_QUEUE,
  HUBSPOT_QUEUE,
  MAIN_QUEUE,
  TI_QUEUE,
  ZOOM_QUEUE,
} from "./queue.constants";
import {
  buildHealthHandler,
  type QueueStatus,
  type WorkersStatus,
} from "./health.handler";
import { TiService } from "../../modules/ti/service";
import { buildTiHandler } from "../../modules/ti/ti.handler";
import { TiRepository } from "../../modules/ti/repository";
import { MoodleHttpClient } from "../../modules/ti/http";

type WorkerTuningOptions = {
  lockDuration?: number;
  lockRenewTime?: number;
  maxStalledCount?: number;
  stalledInterval?: number;
};
// ===================================================================
// Factory: crea un Worker con el ciclo de log estandarizado
// ===================================================================
function buildWorker(
  queueName: string,
  handler: (job: Job) => Promise<unknown>,
  concurrency: number,
  log: ReturnType<typeof buildJobLog>,
  options?: WorkerTuningOptions,
) {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      logger.info(
        { queueName, jobName: job.name, jobId: job.id },
        "JOB RECIBIDO",
      ); // ← AGREGAR

      const startedAt = Date.now();
      const jobId = String(job.id ?? `pending-${job.data?.traceId}`);

      try {
        // await log.markJobProcessing(jobId, job.attemptsMade);
        await log.markJobProcessing(jobId, job.attemptsMade, {
          queueName,
          jobName: job.name,
          action: job.data?.action ?? null,
          source: job.data?.source ?? "scheduler",
          traceId: job.data?.trace_id ?? job.data?.traceId ?? null,
          scheduleId: job.data?.schedule_id ?? job.data?.scheduleId ?? null,
          payload: job.data ?? null,
        });
      } catch (err) {
        logger.error({ jobId, err }, "Error markJobProcessing");
      }

      try {
        const res = await handler(job);
        const durationMs = Date.now() - startedAt;
        try {
          await log.markJobCompleted(jobId, durationMs, job.attemptsMade, res);
        } catch (err) {
          logger.error({ jobId, err }, "Error markJobCompleted");
        }
        logger.info(
          { queueName, jobName: job.name, jobId, durationMs },
          "Job done",
        );
        return res;
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        try {
          await log.markJobFailed(
            jobId,
            durationMs,
            job.attemptsMade,
            errorMessage,
          );
        } catch (errLog) {
          logger.error({ jobId, errLog }, "Error markJobFailed");
        }
        logger.error(
          { queueName, jobName: job.name, jobId, durationMs, err },
          "Job execution error",
        );
        throw err;
      }
    },
    {
      connection: redisConnection,
      concurrency,
      ...options,
    } as any,
  );

  // QueueEvents (solo para logging local)
  const events = new QueueEvents(queueName, { connection: redisConnection });
  events.on("completed", ({ jobId }) =>
    logger.info({ queueName, jobId }, "QueueEvents completed"),
  );
  events.on("failed", ({ jobId, failedReason }) =>
    logger.error({ queueName, jobId, failedReason }, "QueueEvents failed"),
  );

  // Estado del worker para el health check
  const state = { ready: false, lastError: null as string | null };

  worker.on("ready", () => {
    state.ready = true;
    logger.info(`Worker '${queueName}' listo`);
  });
  worker.on("error", (err) => {
    state.lastError = err instanceof Error ? err.message : String(err);
    logger.error({ queueName, err }, "Worker error");
  });
  worker.on("closing", () => {
    state.ready = false;
  });

  const getStatus = (): QueueStatus => ({
    ready: state.ready,
    running: worker.isRunning(),
    paused: worker.isPaused(),
    lastError: state.lastError,
  });

  return { worker, events, getStatus };
}

// ===================================================================
// startWorkers: arma services con la BD y arranca ambos workers
// ===================================================================
export function startWorkers(db: DbRegistry) {
  const log = buildJobLog(db);

  // Zoom
  const zoomService = new ZoomService(
    new ZoomHttpClient(),
    new ZoomRepository(db),
  );
  const zoom = buildWorker(ZOOM_QUEUE, buildZoomHandler(zoomService), 2, log);

  // Hubspot
  const hubspotService = new HubspotService(
    new HubspotHttpClient(),
    new HubspotRepository(db),
  );

  const hubspot = buildWorker(
    HUBSPOT_QUEUE,
    buildHubspotHandler(hubspotService),
    1,
    log,
    {
      lockDuration: 30 * 60 * 1000,
      lockRenewTime: 15 * 60 * 1000,
      maxStalledCount: 1,
    },
  );

  // Ti
  const tiService = new TiService(new TiRepository(db), new MoodleHttpClient());
  const ti = buildWorker(TI_QUEUE, buildTiHandler(tiService), 2, log);

  // Health: estado GENERAL de las 3 colas (viven en el mismo proceso)
  const mailService = new MailService();
  const mail = buildWorker(MAIN_QUEUE, buildMailHandler(mailService), 5, log);

  const getStatus = (): WorkersStatus => ({
    [ZOOM_QUEUE]: zoom.getStatus(),
    [HUBSPOT_QUEUE]: hubspot.getStatus(),
    [TI_QUEUE]: ti.getStatus(),
    [MAIN_QUEUE]: mail.getStatus(),
  });

  // Cola dedicada 'health': liviana y aislada, siempre responde rápido
  const health = buildWorker(
    HEALTH_QUEUE,
    buildHealthHandler(getStatus, db),
    5,
    log,
  );

  logger.info("Workers 'zoom', 'hubspot', 'ti', 'main' y 'health' iniciados");

  const closeAll = async () => {
    await Promise.all([
      zoom.worker.close(),
      zoom.events.close(),
      hubspot.worker.close(),
      hubspot.events.close(),
      ti.worker.close(),
      ti.events.close(),
      mail.worker.close(),
      mail.events.close(),
      health.worker.close(),
      health.events.close(),
    ]);
  };

  return { closeAll, getStatus };
}
