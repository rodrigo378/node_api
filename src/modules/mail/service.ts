import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../core/config/env";
import { logger } from "../../core/config/logger";
import type { SendMailPayload, SendMailResult } from "./types";

// ===================================================================================
export class MailService {
  private transporter: Transporter | null = null;

  // ===================================================================================
  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const { HOST, PORT, USER, PASSWORD } = env.MAIL;

    if (!USER || !PASSWORD) {
      throw new Error(
        "Falta CORREO_OUTLOOK o CLAVE_CORREO: el envio de correo no esta configurado",
      );
    }

    this.transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: false,
      auth: { user: USER, pass: PASSWORD },
    });

    return this.transporter;
  }

  // ===================================================================================
  private normalizar(valor?: string | string[]) {
    if (!valor) return undefined;
    const lista = Array.isArray(valor) ? valor : [valor];
    const limpia = lista.map((v) => v.trim()).filter(Boolean);
    return limpia.length ? limpia : undefined;
  }

  // ===================================================================================
  async enviar(payload: SendMailPayload): Promise<SendMailResult> {
    const to = this.normalizar(payload.to);
    if (!to) throw new Error("El correo no tiene destinatario");
    if (!payload.subject?.trim()) throw new Error("El correo no tiene asunto");
    if (!payload.html?.trim() && !payload.text?.trim()) {
      throw new Error("El correo no tiene contenido");
    }

    const { USER, FROM_NAME } = env.MAIL;

    const info = await this.getTransporter().sendMail({
      from: `"${FROM_NAME}" <${USER}>`,
      to,
      cc: this.normalizar(payload.cc),
      bcc: this.normalizar(payload.bcc),
      replyTo: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.messageId ? { messageId: payload.messageId } : {}),
      ...(payload.inReplyTo
        ? {
            inReplyTo: payload.inReplyTo,
            references: payload.references?.length
              ? payload.references
              : [payload.inReplyTo],
          }
        : {}),
      attachments: payload.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
        contentType: a.contentType,
      })),
    });

    const accepted = (info.accepted ?? []).map(String);
    const rejected = (info.rejected ?? []).map(String);

    if (rejected.length) {
      logger.warn(
        { messageId: info.messageId, rejected },
        "Correo con destinatarios rechazados",
      );
    } else {
      logger.info(
        { messageId: info.messageId, to: accepted },
        "Correo enviado",
      );
    }

    return {
      ok: rejected.length === 0,
      messageId: info.messageId,
      accepted,
      rejected,
    };
  }

  // ===================================================================================
  async verificar() {
    if (!env.MAIL.USER || !env.MAIL.PASSWORD) {
      return { ok: false, error: "CORREO_OUTLOOK / CLAVE_CORREO no configurados" };
    }

    try {
      await this.getTransporter().verify();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Error desconocido",
      };
    }
  }
}
