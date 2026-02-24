// {
//     "statusCode": 500,
//     "error": "Internal Server Error",
//     "message": "Zoom getUsers 3 error 404: {\"code\":3001,\"message\":\"Meeting does not exist: AsrIpnYRn6z1jnfgzEcuA==.\"}"
// }
import { request } from "undici";
import { env } from "../../core/config/env";
import type {
  ZoomMeetingParticipantsResponse,
  ZoomMeetingReportItem,
  ZoomMeetingsReportResponse,
  ZoomTokenResponse,
  ZoomUsersResponse,
} from "./types";

export class ZoomHttpClient {
  private token: string | null = null;
  private expiresAtMs = 0;

  private encodeMeetingUuid(uuid: string) {
    // OJO: no quitar '/' internos; solo espacios
    const clean = String(uuid ?? "").trim();
    // Zoom: a veces exige doble encoding si trae '/' o empieza con '/'
    return encodeURIComponent(encodeURIComponent(clean));
  }

  private async getToken() {
    const now = Date.now();
    if (this.token && now < this.expiresAtMs - 30_000) return this.token;

    console.log("env.ZOOM.ACCOUNT_ID => ", env.ZOOM.ACCOUNT_ID);

    const url = "https://zoom.us/oauth/token";
    const params = new URLSearchParams({
      grant_type: "account_credentials",
      account_id: env.ZOOM.ACCOUNT_ID,
    });

    const basic = Buffer.from(
      `${env.ZOOM.CLIENT_ID}:${env.ZOOM.CLIENT_SECRET}`,
    ).toString("base64");

    const res = await request(`${url}?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom token error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    const data = (await res.body.json()) as ZoomTokenResponse;
    this.token = data.access_token;
    this.expiresAtMs = now + data.expires_in * 1000;
    return this.token;
  }

  private async authHeaders() {
    return { Authorization: `Bearer ${await this.getToken()}` };
  }

  async getUsers(page_size = 2000, page_number = 1, status = "active") {
    const qs = new URLSearchParams({
      page_size: String(page_size),
      page_number: String(page_number),
      status,
    });

    const res = await request(`${env.ZOOM.BASE_URL}/users?${qs.toString()}`, {
      method: "GET",
      headers: await this.authHeaders(),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getUsers 1 error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomUsersResponse;
  }

  async getReuniones(
    usuario_id: string,
    from: string,
    to: string,
    page_size: number,
  ) {
    const qs = new URLSearchParams({
      from,
      to,
      page_size: String(page_size),
    });
    const res = await request(
      `${env.ZOOM.BASE_URL}/report/users/${usuario_id}/meetings?${qs.toString()}`,
      { method: "GET", headers: await this.authHeaders() },
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getUsers 2 error ${res.statusCode}: ${await res.body.text()}`,
      );
    }
    return (await res.body.json()) as ZoomMeetingsReportResponse;
  }

  async getDetalleReunion(uuid: string) {
    const uuidEnc = this.encodeMeetingUuid(uuid);

    const base = env.ZOOM.BASE_URL.replace(/\/+$/, ""); // evita // en base
    const url = `${base}/report/meetings/${uuidEnc}`;

    const res = await request(url, {
      method: "GET",
      headers: await this.authHeaders(),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getDetalleReunion error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomMeetingReportItem;
  }

  async getParticipantesReunion(uuid: string, page_size: number) {
    const uuidEnc = this.encodeMeetingUuid(uuid);

    const qs = new URLSearchParams({ page_size: String(page_size) });

    const base = env.ZOOM.BASE_URL.replace(/\/+$/, "");
    const url = `${base}/report/meetings/${uuidEnc}/participants?${qs.toString()}`;

    const res = await request(url, {
      method: "GET",
      headers: await this.authHeaders(),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getParticipantesReunion error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomMeetingParticipantsResponse;
  }
}
