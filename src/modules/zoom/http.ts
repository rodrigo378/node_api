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
        `Zoom getUsers error ${res.statusCode}: ${await res.body.text()}`,
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
        `Zoom getUsers error ${res.statusCode}: ${await res.body.text()}`,
      );
    }
    return (await res.body.json()) as ZoomMeetingsReportResponse;
  }

  async getDetalleReunion(uuid: string) {
    const res = await request(`${env.ZOOM.BASE_URL}/report/meetings/${uuid}`, {
      method: "GET",
      headers: await this.authHeaders(),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getUsers error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomMeetingReportItem;
  }

  async getParticipantesReunion(uuid: string, page_size: number) {
    const qs = new URLSearchParams({
      page_size: String(page_size),
    });

    const res = await request(
      `${env.ZOOM.BASE_URL}/report/meetings/${uuid}/participants?${qs.toString()}`,
      { method: "GET", headers: await this.authHeaders() },
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getUsers error ${res.statusCode}: ${await res.body.text()}`,
      );
    }
    return (await res.body.json()) as ZoomMeetingParticipantsResponse;
  }
}
