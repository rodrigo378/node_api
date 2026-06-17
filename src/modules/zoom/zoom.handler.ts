import type { Job } from "bullmq";
import { ZoomService } from "./service";
import { ZOOM_ACTIONS } from "../../core/queue/queue.constants";

export function buildZoomHandler(service: ZoomService) {
  return async (job: Job) => {
    const { action, traceId } = job?.data ?? {};

    if (!action) {
      throw new Error("Falta action en job.data (zoom)");
    }

    let result: unknown;

    switch (action) {
      case ZOOM_ACTIONS.SYNC_USERS:
        result = await service.sincronizarUsuarios();
        break;

      case ZOOM_ACTIONS.SYNC_MEETINGS_ROOMS:
        result = await service.sincronizarMeetingsRooms();
        break;

      case ZOOM_ACTIONS.SYNC_INSTANCES:
        result = await service.sincronizarInstancias();
        break;

      case ZOOM_ACTIONS.SYNC_PARTICIPANTS_RAW:
        result = await service.sincronizarParticipantesRaw();
        break;

      case ZOOM_ACTIONS.SYNC_PARTICIPANTS:
        result = await service.sincronizarParticipantes();
        break;

      case ZOOM_ACTIONS.SYNC_ASISTENCIAS:
        result = await service.sincronizarAsistencias();
        break;

      default:
        throw new Error(`[ZOOM] Action no manejada: "${action}"`);
    }

    return {
      ok: true,
      module: "zoom",
      action,
      traceId,
      result,
    };
  };
}
