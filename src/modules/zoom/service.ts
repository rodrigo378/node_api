import { DateTime } from "luxon";
import { ZoomHttpClient } from "./http";
import {
  ZoomMeetingParticipant,
  ZoomMeetingReportItem,
  ZoomMeetingsReportResponse,
  ZoomUser,
} from "./types";
import { ZoomRepository } from "./repository";
import {
  AlumnoRow,
  buildMeetingParticipants,
  mapWithConcurrency,
} from "./helpers";

type ZoomMeetingMerged = Omit<ZoomMeetingReportItem, "uuid"> & {
  uuid: string | string[];
  shortname?: string | undefined;
  participantes?: ZoomMeetingParticipant[] | undefined;
};

export class ZoomService {
  PERU_TZ = "America/Lima";

  FECHA_DESDE = "2026-02-08";
  FECHA_HASTA = "2026-02-15";

  GAP_MINUTES = 10;
  TARDANZA_MIN = 15;
  MIN_PCT = 0.25;

  constructor(
    private zoomHttp: ZoomHttpClient,
    private zoomRepository: ZoomRepository,
  ) {}

  async getUsuarios() {
    // const page_number = 1;
    // const page_size = 2000;

    // const usuarios: ZoomUser[] = [];
    // const resp = await this.zoomHttp.getUsers(page_size, page_number);
    // const page_count = resp.page_count;
    // usuarios.push(...resp.users);

    // for (let i = 1; i <= page_count; i++) {
    //   const resp = await this.zoomHttp.getUsers(page_size, i);
    //   usuarios.push(...resp.users);
    // }
    const usuarios: ZoomUser[] = [
      {
        id: "3dfDBWDgTYy-mZAF4RBe7Q",
        first_name: "SALA 1",
        last_name: "UMA",
        display_name: "SALA 1 UMA",
        email: "sala1@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:22:39Z",
        last_login_time: "2026-02-24T13:50:32Z",
        status: "active",
      },
      {
        id: "NtqBO341QL62U3yjAY_ffQ",
        first_name: "SALA 2",
        last_name: "UMA",
        display_name: "SALA 2 UMA",
        email: "sala2@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:24:21Z",
        last_login_time: "2025-10-31T14:01:38Z",
      },
      {
        id: "WiJ5zZChQG22ey7BFdeXxA",
        first_name: "SALA 3",
        last_name: "UMA",
        display_name: "SALA 3 UMA",
        email: "sala3@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:26:11Z",
        last_login_time: "2025-10-25T15:22:02Z",
      },
      {
        id: "HrhCnxEYQ0mxD5w6QBVltg",
        first_name: "SALA 4",
        last_name: "UMA",
        display_name: "SALA 4 UMA",
        email: "sala4@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:28:20Z",
        last_login_time: "2026-02-04T17:03:55Z",
      },
      {
        id: "RGg5G0ZyToOtGn0x3uv1ow",
        first_name: "SALA 5",
        last_name: "UMA",
        display_name: "SALA 5 UMA",
        email: "sala5@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:32:41Z",
        last_login_time: "2026-02-06T22:11:43Z",
        status: "active",
      },
      {
        id: "3AyABJ5zTXeePih6V0HPhQ",
        first_name: "SALA 6",
        last_name: "UMA",
        display_name: "SALA 6 UMA",
        email: "sala6@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:43:30Z",
        last_login_time: "2025-12-13T21:26:55Z",
        status: "active",
      },
      {
        id: "YCx8Es6AQEm8LuO-l2sfPA",
        first_name: "SALA 7",
        last_name: "UMA",
        display_name: "SALA 7 UMA",
        email: "sala7@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:47:52Z",
        last_login_time: "2025-11-06T17:46:02Z",
      },
      {
        id: "Q6gQ15TZRp6qFjUO9DvI5g",
        first_name: "SALA 8",
        last_name: "UMA",
        display_name: "SALA 8 UMA",
        email: "sala8@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:49:20Z",
        last_login_time: "2026-02-20T20:01:25Z",
      },
      {
        id: "153iSXzRQ0WxaazFWriJ1g",
        first_name: "SALA 9",
        last_name: "UMA",
        display_name: "SALA 9 UMA",
        email: "sala9@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:51:14Z",
        last_login_time: "2026-02-02T16:23:11Z",
      },
      {
        id: "9jgwWW6eT6-O-rP9USCQ5g",
        first_name: "SALA 10",
        last_name: "UMA",
        display_name: "SALA 10 UMA",
        email: "sala10@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:54:25Z",
        last_login_time: "2026-02-20T20:51:47Z",
      },
      {
        id: "4o1ujUagRpyDuMyLGOkIkw",
        first_name: "SALA 11",
        last_name: "UMA",
        display_name: "SALA 11 UMA",
        email: "sala11@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:55:50Z",
        last_login_time: "2025-11-05T16:57:52Z",
        status: "active",
      },
      {
        id: "Afz8M1LST7CrPGDAvHTLPA",
        first_name: "SALA 12",
        last_name: "UMA",
        display_name: "SALA 12 UMA",
        email: "sala12@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:57:35Z",
        last_login_time: "2026-02-02T01:18:51Z",
      },
      {
        id: "gw0or1fOS0y8uPZvScgpUw",
        first_name: "SALA 13",
        last_name: "UMA",
        display_name: "SALA 13 UMA",
        email: "sala13@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T22:59:08Z",
        last_login_time: "2026-02-11T19:40:18Z",
      },
      {
        id: "c9nnZrhMTcqoxOT73iCGFQ",
        first_name: "SALA 14",
        last_name: "UMA",
        display_name: "SALA 14 UMA",
        email: "sala14@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T23:01:32Z",
        last_login_time: "2025-11-10T17:54:40Z",
      },
      {
        id: "L2l5HxiBQ5KaSncmlp6UlA",
        first_name: "SALA 15",
        last_name: "UMA",
        display_name: "SALA 15 UMA",
        email: "sala15@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T23:03:26Z",
        last_login_time: "2026-02-16T22:33:00Z",
      },
      {
        id: "d52iwuj_SJal1LYbRVYJAg",
        first_name: "SALA 16",
        last_name: "UMA",
        display_name: "SALA 16 UMA",
        email: "sala16@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T23:18:05Z",
        last_login_time: "2026-02-23T19:48:45Z",
      },
      {
        id: "ivniRVYSSw2WaFwqdFFIPA",
        first_name: "SALA 17",
        last_name: "UMA",
        display_name: "SALA 17 UMA",
        email: "sala17@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-03T23:19:45Z",
        last_login_time: "2026-01-20T21:52:59Z",
      },
      {
        id: "k8LjF4N4SvqndIcIOzO3Dw",
        first_name: "SALA 18",
        last_name: "UMA",
        display_name: "SALA 18 UMA",
        email: "sala18@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:01:58Z",
        last_login_time: "2026-02-11T23:21:18Z",
        status: "active",
      },
      {
        id: "J6lNR8nbR_OaEidVod79oQ",
        first_name: "SALA 19",
        last_name: "UMA",
        display_name: "SALA 19 UMA",
        email: "sala19@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:03:38Z",
        last_login_time: "2025-11-04T02:48:31Z",
        status: "active",
      },
      {
        id: "9QBpXY3hT6mjc2n_OJVquA",
        first_name: "SALA 20",
        last_name: "UMA",
        display_name: "SALA 20 UMA",
        email: "sala20@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:07:44Z",
        last_login_time: "2026-02-16T16:33:50Z",
      },
      {
        id: "5DH1NhUsRb6Hf-dK3ufg9w",
        first_name: "SALA 21",
        last_name: "UMA",
        display_name: "SALA 21 UMA",
        email: "sala21@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:09:05Z",
        last_login_time: "2025-12-05T20:49:50Z",
      },
      {
        id: "fBjsm6KLSTmUE8plI3SAEw",
        first_name: "SALA 22",
        last_name: "UMA",
        display_name: "SALA 22 UMA",
        email: "sala22@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:38:17Z",
        last_login_time: "2026-02-21T13:33:59Z",
      },
      {
        id: "-lD2aDSYSbGYzhyP_FG78Q",
        first_name: "SALA 23",
        last_name: "UMA",
        display_name: "SALA 23 UMA",
        email: "sala23@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:39:53Z",
        last_login_time: "2026-02-13T17:52:22Z",
      },
      {
        id: "QQnRQYBvSOGXT5iuNLrzvg",
        first_name: "SALA 24",
        last_name: "UMA",
        display_name: "SALA 24 UMA",
        email: "sala24@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T04:04:54Z",
        last_login_time: "2025-11-19T21:49:05Z",
      },
      {
        id: "rPN4D7iIRvOvmiV1Sd67Xg",
        first_name: "SALA 25",
        last_name: "UMA",
        display_name: "SALA 25 UMA",
        email: "sala25@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:52:32Z",
        last_login_time: "2026-02-23T23:27:27Z",
      },
      {
        id: "YgX7UYsvRY2oBvZr7ix6Jg",
        first_name: "SALA 26",
        last_name: "UMA",
        display_name: "SALA 26 UMA",
        email: "sala26@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:54:34Z",
        last_login_time: "2025-10-07T03:39:41Z",
      },
      {
        id: "KeTlAIr1QYehj9IfblSw6w",
        first_name: "SALA 27",
        last_name: "UMA",
        display_name: "SALA 27 UMA",
        email: "sala27@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-13T03:58:57Z",
        last_login_time: "2026-02-05T23:54:31Z",
      },
      {
        id: "AyeaAlCCSyyxCM5pjeetSw",
        first_name: "SALA 28",
        last_name: "UMA",
        display_name: "SALA 28 UMA",
        email: "sala28@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-05-13T04:00:15Z",
        last_login_time: "2025-10-01T20:19:24Z",
      },
      {
        id: "SScMf0w6Q9qY0cuVXqvNiA",
        first_name: "SALA 29",
        last_name: "UMA",
        display_name: "SALA 29 UMA",
        email: "sala29@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-05-13T04:01:36Z",
        last_login_time: "2025-05-14T23:24:20Z",
      },
      {
        id: "POFHF4PeS_2Y8LDn6bwOwg",
        first_name: "SALA 30",
        last_name: "UMA",
        display_name: "SALA 30 UMA",
        email: "sala30@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-05-06T14:36:25Z",
        last_login_time: "2025-12-05T20:51:11Z",
      },
      {
        id: "0SLWTvWNTneGbNh6VmjE_A",
        first_name: "SALA 31",
        last_name: "UMA",
        display_name: "SALA 31 UMA",
        email: "sala31@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-07-08T18:49:03Z",
        last_login_time: "2025-10-27T16:36:14Z",
        status: "active",
      },
      {
        id: "VdqanWVeRBGZzItdimrqDw",
        first_name: "SALA 32",
        last_name: "UMA",
        display_name: "SALA 32 UMA",
        email: "sala32@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-07-08T18:55:18Z",
        last_login_time: "2025-11-05T16:54:44Z",
      },
      {
        id: "4E7qtHUATteg6qHf_GUpvw",
        first_name: "SALA 33",
        last_name: "UMA",
        display_name: "SALA 33 UMA",
        email: "sala33@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-07-08T18:57:23Z",
        last_login_time: "2025-10-15T15:11:22Z",
      },
      {
        id: "4OHWML8ZSg-dsak9fcV_8A",
        first_name: "SALA 34",
        last_name: "UMA",
        display_name: "SALA 34",
        email: "sala34@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-07-08T18:59:37Z",
        last_login_time: "2025-05-14T00:40:54Z",
      },
      {
        id: "YduC79GlQQ27qkJRyLcz3A",
        first_name: "SALA 35",
        last_name: "UMA",
        display_name: "SALA 35 UMA",
        email: "sala35@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-07-08T19:01:34Z",
        last_login_time: "2025-10-15T15:12:12Z",
      },
      {
        id: "uebsSDTUSfC9cBL-QnVk-Q",
        first_name: "SALA 36",
        last_name: "UMA",
        display_name: "SALA 36 UMA",
        email: "sala36@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-07-08T19:03:35Z",
        last_login_time: "2025-11-21T16:09:56Z",
      },
      {
        id: "9UyghmhYS027lZO69XdqLA",
        first_name: "SALA 37",
        last_name: "UMA",
        display_name: "SALA 37 UMA",
        email: "sala37@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-07-08T19:05:11Z",
        last_login_time: "2025-12-04T17:34:12Z",
      },
      {
        id: "lxnU-TNLR8KH3LVhSQEivw",
        first_name: "SALA 38",
        last_name: "UMA",
        display_name: "SALA 38 UMA",
        email: "sala38@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-07-08T19:06:42Z",
        last_login_time: "2025-10-15T15:19:10Z",
        status: "active",
      },
      {
        id: "-pJ9sS-iQ_-BHoleu4iKig",
        first_name: "SALA 39",
        last_name: "UMA",
        display_name: "SALA 39 UMA",
        email: "sala39@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-07-08T19:07:50Z",
        last_login_time: "2025-10-16T16:37:10Z",
      },
      {
        id: "i7j1DXbqRdiNjJXA816AsA",
        first_name: "SALA 40",
        last_name: "UMA",
        display_name: "SALA 40 UMA",
        email: "sala40@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2020-07-08T19:11:11Z",
        last_login_time: "2025-10-15T02:38:32Z",
      },
      {
        id: "am0vfZcWR4aCEmMGqIXS5Q",
        first_name: "SALA 41",
        last_name: "UMA",
        display_name: "SALA 41 UMA",
        email: "sala41@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2020-09-29T21:41:28Z",
        last_login_time: "2026-02-24T01:09:45Z",
      },
      {
        id: "bjsxIY5vQ-2gIMrz1NLu2w",
        first_name: "SALA 42",
        last_name: "UMA",
        display_name: "SALA 42 UMA",
        email: "sala42@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:19:38Z",
        last_login_time: "2026-02-23T15:30:45Z",
        status: "active",
      },
      {
        id: "leHyPXfOTLCjg4KZaSySYg",
        first_name: "SALA 43",
        last_name: "UMA",
        display_name: "SALA 43 UMA",
        email: "sala43@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:26:52Z",
        last_login_time: "2025-10-11T15:23:40Z",
        status: "active",
      },
      {
        id: "HtamoRchQqGGJeuHWWYAug",
        first_name: "SALA 44",
        last_name: "UMA",
        display_name: "SALA 44 UMA",
        email: "sala44@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:33:11Z",
        last_login_time: "2025-04-03T03:43:30Z",
        status: "active",
      },
      {
        id: "mw2e1bjXTB6Al2W-rkcG5g",
        first_name: "SALA 46",
        last_name: "UMA",
        display_name: "SALA 46 UMA",
        email: "sala46@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:39:24Z",
        last_login_time: "2025-01-22T21:24:03Z",
        status: "active",
      },
      {
        id: "0Sse3dmmSb6KSsHiJrjyXQ",
        first_name: "SALA 47",
        last_name: "UMA",
        display_name: "SALA 47 UMA",
        email: "sala47@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:41:40Z",
        last_login_time: "2024-09-20T21:28:32Z",
        status: "active",
      },
      {
        id: "x9f0hM5GQSKk1uSHTqn30w",
        first_name: "SALA 48",
        last_name: "UMA",
        display_name: "SALA 48 UMA",
        email: "sala48@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:43:37Z",
        last_login_time: "2024-09-18T21:52:25Z",
        status: "active",
      },
      {
        id: "xrfCfiXlRhOkGcXn9LK3YA",
        first_name: "SALA 49",
        last_name: "UMA",
        display_name: "SALA 49 UMA",
        email: "sala49@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:46:09Z",
        last_login_time: "2025-10-28T14:19:13Z",
        status: "active",
      },
      {
        id: "Z3p5vTFOSQicRqdCyl26kw",
        first_name: "SALA 50",
        last_name: "UMA",
        display_name: "SALA 50 UMA",
        email: "sala50@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2021-04-17T00:49:26Z",
        last_login_time: "2026-02-17T23:01:18Z",
        status: "active",
      },
      {
        id: "HjvBff6LR5-vah3Zs8rONA",
        first_name: "SALA 51",
        last_name: "UMA",
        display_name: "SALA 51 UMA",
        email: "sala51@uma.edu.pe",
        type: 2,
        timezone: "America/Lima",
        created_at: "2021-04-23T22:20:54Z",
        last_login_time: "2025-11-27T20:39:24Z",
        status: "active",
      },
      {
        id: "zxCnPlhzQMqoV9WIYsF_7Q",
        first_name: "SALA 52",
        last_name: "UMA",
        display_name: "SALA 52 UMA",
        email: "sala52@uma.edu.pe",
        type: 1,
        timezone: "America/Lima",
        created_at: "2023-05-29T21:32:00Z",
        last_login_time: "2024-09-20T21:36:07Z",
      },
    ];

    return usuarios;
  }

  async getReuniones() {
    const usuarios = await this.getUsuarios();

    const param_from = "2026-02-01";
    const param_to = "2026-02-30";
    const page_size = 300;

    const meetingsPerUser = await mapWithConcurrency(usuarios, 3, async (u) => {
      const resp: ZoomMeetingsReportResponse = await this.zoomHttp.getReuniones(
        u.id,
        param_from,
        param_to,
        page_size,
      );

      return resp.meetings as ZoomMeetingReportItem[];
    });

    const reuniones: ZoomMeetingReportItem[] = meetingsPerUser.flat();

    for (const r of reuniones) {
      if (r.start_time) {
        r.start_time =
          DateTime.fromISO(r.start_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.start_time;
      }
      if (r.end_time) {
        r.end_time =
          DateTime.fromISO(r.end_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.end_time;
      }
    }

    return reuniones;
  }

  async filtrarReuniones() {
    const reuniones = await this.getReuniones();

    for (const r of reuniones) {
      if (r.start_time) {
        r.start_time =
          DateTime.fromISO(r.start_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.start_time;
      }
      if (r.end_time) {
        r.end_time =
          DateTime.fromISO(r.end_time, { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? r.end_time;
      }
    }

    const desde = DateTime.fromISO(this.FECHA_DESDE, {
      zone: this.PERU_TZ,
    }).startOf("day");
    const hasta = DateTime.fromISO(this.FECHA_HASTA, {
      zone: this.PERU_TZ,
    }).endOf("day");

    const reunionesRango = reuniones.filter((r) => {
      if (!r.start_time) return false;
      const st = DateTime.fromISO(r.start_time, { zone: this.PERU_TZ });
      return (
        st.toMillis() >= desde.toMillis() && st.toMillis() <= hasta.toMillis()
      );
    });

    return this.mergedUuidArray(reunionesRango);
  }

  async mergedUuidArray(reuniones: ZoomMeetingReportItem[]) {
    const grupos = new Map<number, ZoomMeetingReportItem[]>();

    for (const r of reuniones) {
      const arr = grupos.get(r.id) ?? [];
      arr.push(r);
      grupos.set(r.id, arr);
    }

    const merged: ZoomMeetingMerged[] = [];

    for (const [, items] of grupos) {
      if (items.length === 1) {
        merged.push(items[0]!);
        continue;
      }

      const startMin = items.reduce((min, it) => {
        const t = Date.parse(it.start_time);
        return t < min ? t : min;
      }, Number.POSITIVE_INFINITY);

      const endMax = items.reduce((max, it) => {
        const t = Date.parse(it.end_time);
        return t > max ? t : max;
      }, Number.NEGATIVE_INFINITY);

      const principal = items[0]!;

      merged.push({
        ...principal,
        uuid: items.map((x) => x.uuid),
        start_time:
          DateTime.fromISO(new Date(startMin).toISOString(), { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? new Date(startMin).toISOString(),
        end_time:
          DateTime.fromISO(new Date(endMax).toISOString(), { zone: "utc" })
            .setZone(this.PERU_TZ)
            .toISO() ?? new Date(endMax).toISOString(),
      });
    }

    return merged;
  }

  async enriquerReuniones() {
    const reuniones = await this.filtrarReuniones();

    // 🔥 alumnos una sola vez
    const alumnos: AlumnoRow[] = await this.zoomRepository.getEstudiantes();

    for (const reu of reuniones) {
      if (typeof reu.uuid === "string") {
        const respDetalle = await this.zoomHttp.getDetalleReunion(reu.uuid);

        const respParticipantes = await this.zoomHttp.getParticipantesReunion(
          reu.uuid,
          300,
        );

        const shortname = respDetalle.tracking_fields?.find(
          (t) => t.field === "shortname",
        )?.value;

        reu.shortname = shortname;

        // ✅ NUEVO: arma participantes + resumen host (clase)
        const { participantesFinal, hostSummary } = buildMeetingParticipants(
          respParticipantes.participants,
          alumnos,
          10,
        );

        reu.participantes = participantesFinal;

        // ✅ si quieres que la clase se mida por el host (AULA/SALA)
        if (hostSummary.class_start) reu.start_time = hostSummary.class_start;
        if (hostSummary.class_end) reu.end_time = hostSummary.class_end;

        // ✅ guarda duración real (segundos) donde tú quieras
        (reu as any).class_duration_sec = hostSummary.class_duration_sec;
      }

      if (typeof reu.uuid === "object") {
        const respDetalle = await this.zoomHttp.getDetalleReunion(reu.uuid[0]!);

        const shortname = respDetalle.tracking_fields?.find(
          (t) => t.field === "shortname",
        )?.value;

        const participantes: any[] = [];

        for (const uuid of reu.uuid) {
          const resp = await this.zoomHttp.getParticipantesReunion(uuid, 300);
          participantes.push(...resp.participants);
        }

        reu.shortname = shortname;

        // ✅ NUEVO: arma participantes + resumen host (clase)
        const { participantesFinal, hostSummary } = buildMeetingParticipants(
          participantes,
          alumnos,
          10,
        );

        reu.participantes = participantesFinal;

        if (hostSummary.class_start) reu.start_time = hostSummary.class_start;
        if (hostSummary.class_end) reu.end_time = hostSummary.class_end;

        (reu as any).class_duration_sec = hostSummary.class_duration_sec;
      }
    }

    return reuniones;
  }

  weekdayNumberPeru(startIso: string, peruTz = "America/Lima") {
    // Luxon: weekday 1=Lun .. 7=Dom
    return DateTime.fromISO(startIso).setZone(peruTz).weekday;
  }

  pickHorarioForMeetingDay(
    horarios: Array<Record<string, any>>,
    weekday: number, // 1..7
  ) {
    if (!horarios || horarios.length === 0) return null;

    // posibles columnas en tb_cur_grp_hor
    const dayKeys = [
      "n_dia",
      "dia",
      "c_dia",
      "n_diasem",
      "n_dia_sem",
      "n_diasema",
      "n_diaseman",
    ];

    const mapDayText: Record<string, number> = {
      LUNES: 1,
      MARTES: 2,
      MIERCOLES: 3,
      MIÉRCOLES: 3,
      JUEVES: 4,
      VIERNES: 5,
      SABADO: 6,
      SÁBADO: 6,
      DOMINGO: 7,
      LU: 1,
      MA: 2,
      MI: 3,
      JU: 4,
      VI: 5,
      SA: 6,
      DO: 7,
    };

    for (const h of horarios) {
      for (const k of dayKeys) {
        const v = h[k];
        if (v == null) continue;

        // 1) number
        if (typeof v === "number" && v === weekday) return h;

        // 2) string number
        if (typeof v === "string" && Number(v) === weekday) return h;

        // 3) string text (LUNES / LU / etc)
        if (typeof v === "string") {
          const s = v.trim().toUpperCase();
          if (mapDayText[s] === weekday) return h;
        }
      }
    }

    // fallback
    return horarios[0] ?? null;
  }

  extractDniDocente(h: Record<string, any> | null) {
    if (!h) return null;

    const keys = ["c_dnidoc", "dni_doc", "dni", "c_dni", "c_docdni"];

    for (const k of keys) {
      const v = h[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number" && String(v).trim()) return String(v).trim();
    }
    return null;
  }

  // ===== Tu método actualizado =====

  async procesarAsistenciaZoom() {
    console.log("log 0 => inicia procesarAsistenciaZoom");

    console.log("log 1 => llamando enriquerReuniones()");
    const reuniones = await this.enriquerReuniones();
    console.log(
      "log 2 => enriquerReuniones() ok, reuniones =",
      reuniones.length,
    );

    const periodo = 20261;
    console.log("log 3 => periodo =", periodo);

    const TOLERANCIA_MS = this.TARDANZA_MIN * 60 * 1000;

    // =========================================================
    // ✅ Helpers (duración por participante y por docente/host)
    // =========================================================

    const getParticipantDurationSec = (p: any): number => {
      if (!p) return 0;

      // 1) si ya viene normalizado en segundos
      const sec = Number(
        p.duration_sec ?? p.total_duration_sec ?? p.stay_sec ?? 0,
      );
      if (sec && sec > 0) return sec;

      // 2) Zoom suele traer duration en MINUTOS en report
      const min = Number(
        p.duration ?? p.total_minutes ?? p.duration_minutes ?? 0,
      );
      if (min && min > 0) return Math.round(min * 60);

      // 3) fallback: si viene join_time/leave_time
      const jt = p.join_time ? DateTime.fromISO(String(p.join_time)) : null;
      const lt = p.leave_time ? DateTime.fromISO(String(p.leave_time)) : null;
      if (jt && lt && jt.isValid && lt.isValid) {
        const diff = lt.toMillis() - jt.toMillis();
        return diff > 0 ? Math.round(diff / 1000) : 0;
      }

      return 0;
    };

    const getClassDurationSecFromHost = (reu: any): number => {
      // tu buildMeetingParticipants ya lo coloca aquí:
      const sec = Number(reu?.class_duration_sec ?? 0);
      return sec > 0 ? sec : 0;
    };

    let idx = 0;

    for (const reu of reuniones) {
      idx++;
      console.log("log 4 => --- iteración", idx, "reu.id =", (reu as any).id);

      const shortname = String((reu as any).shortname || "").trim();
      console.log("log 5 => shortname =", shortname);

      if (!shortname) {
        console.log("log 6 => SKIP shortname vacío");
        continue;
      }

      const participantes = (reu as any).participantes ?? [];
      console.log("log 8 => participantes =", participantes.length);

      const startIso = String((reu as any).start_time || "");

      const fechaClase = startIso
        ? DateTime.fromISO(startIso).setZone(this.PERU_TZ).toISODate()!
        : DateTime.now().setZone(this.PERU_TZ).toISODate()!;
      console.log("log 9 => fechaClase =", fechaClase);

      // ✅ inicio de clase fijo para guardar en tb_asis_alum_det (NO debe cambiar luego)
      const classStartIsoFixed = startIso
        ? DateTime.fromISO(startIso).setZone(this.PERU_TZ).toISO()!
        : DateTime.now().setZone(this.PERU_TZ).toISO()!;
      console.log("log 9.1 => classStartIsoFixed =", classStartIsoFixed);

      const weekday = startIso
        ? DateTime.fromISO(startIso).setZone(this.PERU_TZ).weekday // 1..7
        : null;
      console.log("log 10 => weekday =", weekday);

      const classStartMs = startIso ? DateTime.fromISO(startIso).toMillis() : 0;

      // =========================================================
      // ✅ duración de clase según docente/host (segundos)
      // =========================================================
      const classDurationSec = getClassDurationSecFromHost(reu);
      const minStaySec =
        classDurationSec > 0 ? Math.round(classDurationSec * this.MIN_PCT) : 0;

      console.log("log 10.1 => classDurationSec =", classDurationSec);
      console.log("log 10.2 => minStaySec(25%) =", minStaySec);

      // =========================================================
      // min join_time por alumno (para tardanza)
      // =========================================================
      const joinByCodigo = new Map<string, number>();
      for (const p of participantes) {
        const cod = String((p as any).codigo || "").trim();
        if (!cod) continue;
        if (!(p as any).join_time) continue;

        const joinMs = DateTime.fromISO(
          String((p as any).join_time),
        ).toMillis();
        const prev = joinByCodigo.get(cod);
        if (prev == null || joinMs < prev) joinByCodigo.set(cod, joinMs);
      }

      // =========================================================
      // ✅ duración acumulada por alumno (segundos) para regla 25%
      //    Si un alumno aparece varias veces, sumamos.
      // =========================================================
      const stayByCodigo = new Map<string, number>();
      for (const p of participantes) {
        const cod = String((p as any).codigo || "").trim();
        if (!cod) continue;

        const sec = getParticipantDurationSec(p);
        if (sec <= 0) continue;

        stayByCodigo.set(cod, (stayByCodigo.get(cod) ?? 0) + sec);
      }

      // ==========================
      // 1) TRAER TODAS LAS FILAS SINCRO DEL SHORTNAME
      // ==========================
      console.log("log 11 => todo(shortname)");
      const sincros = await this.zoomRepository.todo(shortname);
      console.log("log 12 => sincros =", sincros.length);

      if (sincros.length === 0) {
        console.log("log 13 => SKIP: no hay sincro para shortname", shortname);
        continue;
      }

      // ==========================
      // 2) POR CADA FILA SINCRO: CREAR HEADER y DETALLE
      // ==========================
      let j = 0;
      for (const s of sincros) {
        j++;
        console.log("log 20 => --- sincro", j, {
          n_codper: s.n_codper,
          c_codfac: s.c_codfac,
          c_codesp: s.c_codesp,
          c_sedcod: s.c_sedcod,
          c_codcur: s.c_codcur,
          c_grpcur: s.c_grpcur,
          c_codmod: s.c_codmod,
          n_codpla: s.n_codpla,
        });

        // 2.1) DNI DOCENTE por horario del key exacto
        console.log("log 21 => getHorarioPorSincro()");
        const horarios = await this.zoomRepository.getHorarioPorSincro({
          n_codper: s.n_codper,
          c_codfac: s.c_codfac,
          c_codesp: s.c_codesp,
          c_sedcod: s.c_sedcod,
          c_codcur: s.c_codcur,
          c_grpcur: s.c_grpcur,
          c_codmod: s.c_codmod,
          n_codpla: s.n_codpla,
        });
        console.log("log 22 => horarios =", horarios.length);

        let horarioMatch: any = null;

        if (weekday != null && horarios.length > 0) {
          const dayKeys = [
            "n_dia",
            "dia",
            "c_dia",
            "n_diasem",
            "n_dia_sem",
            "n_diasema",
            "n_diaseman",
          ];

          const mapDayText: Record<string, number> = {
            LUNES: 1,
            MARTES: 2,
            MIERCOLES: 3,
            MIÉRCOLES: 3,
            JUEVES: 4,
            VIERNES: 5,
            SABADO: 6,
            SÁBADO: 6,
            DOMINGO: 7,
            LU: 1,
            MA: 2,
            MI: 3,
            JU: 4,
            VI: 5,
            SA: 6,
            DO: 7,
          };

          for (const h of horarios) {
            let ok = false;

            for (const k of dayKeys) {
              const v = (h as any)?.[k];
              if (v == null) continue;

              if (typeof v === "number" && v === weekday) ok = true;
              else if (typeof v === "string" && Number(v) === weekday)
                ok = true;
              else if (typeof v === "string") {
                const txt = v.trim().toUpperCase();
                if (mapDayText[txt] === weekday) ok = true;
              }

              if (ok) break;
            }

            if (ok) {
              horarioMatch = h;
              break;
            }
          }

          if (!horarioMatch) horarioMatch = horarios[0] ?? null;
        }

        let dniDoc: string | null = null;
        if (horarioMatch) {
          const keys = ["c_dnidoc", "dni_doc", "dni", "c_dni", "c_docdni"];
          for (const k of keys) {
            const v = (horarioMatch as any)[k];
            if (typeof v === "string" && v.trim()) {
              dniDoc = v.trim();
              break;
            }
            if (typeof v === "number" && String(v).trim()) {
              dniDoc = String(v).trim();
              break;
            }
          }
        }
        console.log("log 23 => dniDoc =", dniDoc);

        // 2.2) CREAR HEADER SIEMPRE (aunque no haya matriculados)
        console.log("log 24 => ensureAsistenciaHeader()");
        const id_asistencia = await this.zoomRepository.ensureAsistenciaHeader(
          {
            n_codper: Number(s.n_codper) || periodo,
            c_codmod: String(s.c_codmod),
            c_codfac: String(s.c_codfac),
            c_codesp: String(s.c_codesp),
            c_codcur: String(s.c_codcur),
            c_grpcur: String(s.c_grpcur),
            n_codpla: Number(s.n_codpla) || 0,
            c_sedcod: s.c_sedcod ? String(s.c_sedcod) : null,
            c_dnidoc: dniDoc,
            d_fecha: fechaClase,
            tipo: "1",
          },
          { c_user_upd: "ZOOM_BOT" },
          classStartIsoFixed,
        );

        console.log("log 25 => id_asistencia =", id_asistencia);

        // 2.3) Matriculados de ESA fila (si 0 => header queda creado, detalle no)
        console.log("log 26 => getMatriculadosPorSincro()");
        const mats = await this.zoomRepository.getMatriculadosPorSincro({
          n_codper: Number(s.n_codper) || periodo,
          c_codfac: String(s.c_codfac),
          c_codesp: String(s.c_codesp),
          c_codcur: String(s.c_codcur),
          c_grpcur: String(s.c_grpcur),
          c_codmod: String(s.c_codmod),
          n_codpla: Number(s.n_codpla) || 0,
        });

        const matSet = new Set(mats.map((x: any) => String(x.CODIGO)));
        console.log("log 27 => matriculados =", matSet.size);

        if (matSet.size === 0) {
          console.log("log 28 => SIN MATRICULADOS, header creado y seguimos");
          continue;
        }

        // =========================================================
        // ✅ 2.4) Presentes en ESA sección:
        //     matriculados ∩ participantes
        //     + regla 25% permanencia según duración del docente/host
        // =========================================================
        const presentesSeccion = participantes
          .map((p: any) => String(p.codigo || "").trim())
          .filter((cod: string) => {
            if (!cod) return false;
            if (!matSet.has(cod)) return false;

            // Si no hay duración de clase, no aplicamos filtro 25% (fallback)
            if (minStaySec <= 0) return true;

            const stayed = stayByCodigo.get(cod) ?? 0;
            return stayed >= minStaySec;
          });

        console.log(
          "log 29 => presentesSeccion (con 25%) =",
          presentesSeccion.length,
        );

        if (presentesSeccion.length === 0) {
          console.log("log 30 => sin presentes para esta sección, no detalle");
          continue;
        }

        // 2.5) A/T por tardanza (solo para los que cumplieron 25%)
        const rowsDet = presentesSeccion.map((cod: any) => {
          const joinMs = joinByCodigo.get(cod);

          // si no puedo calcular join, por defecto A
          if (!classStartMs || joinMs == null)
            return { c_codalu: cod, c_estado: "A" };

          const tarde = joinMs > classStartMs + TOLERANCIA_MS;
          return { c_codalu: cod, c_estado: tarde ? "T" : "A" };
        });

        const tardones = rowsDet.filter((x: any) => x.c_estado === "T").length;
        console.log(
          "log 31 => rowsDet =",
          rowsDet.length,
          "tardones =",
          tardones,
        );

        // 2.6) upsert detalle
        console.log("log 32 => upsertAsistenciaDetalleConEstado()");
        await this.zoomRepository.upsertAsistenciaDetalleConEstado(
          id_asistencia,
          rowsDet,
          classStartIsoFixed, // ✅ fecha/hora fija: inicio de clase
        );

        console.log("log 33 => detalle OK id_asistencia =", id_asistencia);
      }
    }

    console.log("log 99 => fin procesarAsistenciaZoom");
    return reuniones;
  }
}
