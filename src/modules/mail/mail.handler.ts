import type { Job } from "bullmq";
import { MailService } from "./service";
import { MAIL_ACTIONS } from "../../core/queue/queue.constants";
import type { SendMailPayload } from "./types";

export function buildMailHandler(service: MailService) {
  return async (job: Job) => {
    const { action, traceId, payload } = job?.data ?? {};

    if (!action) {
      throw new Error("Falta action en job.data (main)");
    }

    switch (action) {
      case MAIL_ACTIONS.SEND: {
        if (!payload) {
          throw new Error("Falta payload en job.data (main/send)");
        }

        const result = await service.enviar(payload as SendMailPayload);
        return { ...result, action, traceId };
      }

      default:
        throw new Error(`Action no soportada en main: ${String(action)}`);
    }
  };
}
