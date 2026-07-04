import type { Job } from "bullmq";
import { TI_ACTIONS } from "../../core/queue/queue.constants";
import { TiService } from "./service";

export function buildTiHandler(service: TiService) {
  return async (job: Job) => {
    const { action, source, payload, schedule_id, meta, traceId, trace_id } =
      job?.data ?? {};

    const finalTraceId = traceId ?? trace_id;

    console.log("======================================");
    console.log("[TI] JOB RECIBIDO");
    console.log("job.id:", job.id);
    console.log("job.name:", job.name);
    console.log("action:", action);
    console.log("source:", source);
    console.log("schedule_id:", schedule_id);
    console.log("traceId:", finalTraceId);
    console.log("meta:", meta);
    console.log("payload:", JSON.stringify(payload, null, 2));
    console.log("====================================1==");

    if (!action) {
      throw new Error("Falta action en job.data (ti)");
    }

    let result: unknown;

    switch (action) {
      case TI_ACTIONS.TI_TEST:
        result = await service.test({
          source,
          payload,
          schedule_id,
          meta,
          traceId: finalTraceId,
        });
        break;

      case TI_ACTIONS.SINC_MASIVO: {
        const rawCourseIds = Array.isArray(payload?.courseids)
          ? payload.courseids
          : Array.isArray(payload?.courseIds)
            ? payload.courseIds
            : [];

        const courseids = rawCourseIds
          .map((courseid: unknown) => Number(courseid))
          .filter((courseid: number) => Number.isFinite(courseid));

        result = await service.sincronizarBatch({
          courseids,
          source,
          schedule_id,
        });

        break;
      }

      default:
        throw new Error(`[TI] Action no manejada: "${action}"`);
    }

    console.log("[TI] RESULTADO:");
    console.log(JSON.stringify(result, null, 2));

    return {
      ok: true,
      module: "ti",
      action,
      source,
      traceId: finalTraceId,
      result,
    };
  };
}
