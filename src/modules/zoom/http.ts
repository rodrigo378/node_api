import { request } from "undici";
import { env } from "../../core/config/env";
import {
  ZoomMeetingDetail,
  ZoomMeetingParticipantsResponse,
  ZoomMeetingsReportResponse,
  ZoomPastMeetingInstancesResponse,
  ZoomTokenResponse,
  ZoomUsersResponse,
} from "./types/http.types";

export class ZoomHttpClient {
  private token: string | null = null;
  private expiresAtMs = 0;

  private async getToken() {
    const now = Date.now();
    if (this.token && now < this.expiresAtMs - 30_000) return this.token;

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
      headers: {
        Authorization: `Basic ${basic}`,
      },
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
    return {
      Authorization: `Bearer ${await this.getToken()}`,
    };
  }

  async getUsers(pageSize = 300, pageNumber = 1) {
    const qs = new URLSearchParams({
      page_size: String(pageSize),
      page_number: String(pageNumber),
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

  async getMeetingsRooms(
    usuario_id: string,
    from: string,
    to: string,
    pageSize: number,
    nextPageToken?: string,
  ) {
    const qs = new URLSearchParams({
      from,
      to,
      page_size: String(pageSize),
    });

    if (nextPageToken) {
      qs.set("next_page_token", nextPageToken);
    }

    const res = await request(
      `${env.ZOOM.BASE_URL}/report/users/${usuario_id}/meetings?${qs.toString()}`,
      {
        method: "GET",
        headers: await this.authHeaders(),
      },
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getMeetingsRooms error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomMeetingsReportResponse;
  }

  async getMeetingsRoomsDetails(room_id: bigint) {
    const res = await request(`${env.ZOOM.BASE_URL}/meetings/${room_id}`, {
      method: "GET",
      headers: await this.authHeaders(),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getMeetingsRooms error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomMeetingDetail;
  }

  async getMeetingInstances(meeting_id: bigint) {
    const res = await request(
      `${env.ZOOM.BASE_URL}/past_meetings/${meeting_id}/instances`,
      {
        method: "GET",
        headers: await this.authHeaders(),
      },
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getMeetingInstances error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomPastMeetingInstancesResponse;
  }

  async getMeetingReportDetailParticipants(
    meetingUUID: string,
    nextPageToken?: string,
  ) {
    const encodedUUID = encodeURIComponent(encodeURIComponent(meetingUUID));

    const url = new URL(
      `${env.ZOOM.BASE_URL}/report/meetings/${encodedUUID}/participants`,
    );

    url.searchParams.set("page_size", "300");

    if (nextPageToken) {
      url.searchParams.set("next_page_token", nextPageToken);
    }

    const res = await request(url.toString(), {
      method: "GET",
      headers: await this.authHeaders(),
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(
        `Zoom getMeetingParticipants error ${res.statusCode}: ${await res.body.text()}`,
      );
    }

    return (await res.body.json()) as ZoomMeetingParticipantsResponse;
  }
}
