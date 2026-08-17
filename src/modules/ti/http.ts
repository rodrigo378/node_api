import { request } from "undici";
import { env } from "../../core/config/env";

export interface MoodleRole {
  roleid: number;
  name: string;
  shortname: string;
  sortorder: number;
}

export interface MoodleUser {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  roles: MoodleRole[];
}

export class MoodleHttpClient {
  // ===================================================================================
  async getMatriculadosMoodle(courseid: number) {
    const body = new URLSearchParams();

    body.append("wstoken", env.TI.TOKEN_MOODLE);
    body.append("moodlewsrestformat", "json");
    body.append("wsfunction", "core_enrol_get_enrolled_users");
    body.append("courseid", String(courseid));
    body.append("options[0][name]", "onlyactive");
    body.append("options[0][value]", "1");

    const res = await request(env.TI.BASE_MOODLE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await res.body.text();

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Moodle HTTP error ${res.statusCode}: ${text}`);
    }

    const data = JSON.parse(text) as
      | MoodleUser[]
      | {
          exception?: string;
          errorcode?: string;
          message?: string;
        };

    if (!Array.isArray(data)) {
      throw new Error(`Moodle API error: ${JSON.stringify(data)}`);
    }

    return data;
  }

  // ===================================================================================
  async getUsersByEmail(emails: string[]) {
    const cleanEmails = emails
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0);

    if (cleanEmails.length === 0) {
      return [];
    }

    const body = new URLSearchParams();

    body.append("wstoken", env.TI.TOKEN_MOODLE);
    body.append("moodlewsrestformat", "json");
    body.append("wsfunction", "core_user_get_users_by_field");
    body.append("field", "email");

    cleanEmails.forEach((email, index) => {
      body.append(`values[${index}]`, email);
    });

    const res = await request(env.TI.BASE_MOODLE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await res.body.text();

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Moodle HTTP error ${res.statusCode}: ${text}`);
    }

    const data = JSON.parse(text) as MoodleUser[];

    if (!Array.isArray(data)) {
      throw new Error(`Moodle API error: ${JSON.stringify(data)}`);
    }

    return data;
  }

  async suspenderMatricula(
    users: Array<Pick<MoodleUser, "id"> & { roleid: number }>,
    courseid: number,
  ) {
    if (users.length === 0) return;

    const body = new URLSearchParams();

    body.append("wstoken", env.TI.TOKEN_MOODLE);
    body.append("moodlewsrestformat", "json");
    body.append("wsfunction", "enrol_manual_enrol_users");

    users.forEach((a, x) => {
      body.append(`enrolments[${x}][userid]`, String(a.id));
      body.append(`enrolments[${x}][courseid]`, String(courseid));
      body.append(`enrolments[${x}][roleid]`, String(a.roleid));
      body.append(`enrolments[${x}][suspend]`, "1");
    });

    const response = await request(env.TI.BASE_MOODLE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await response.body.text();

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Moodle HTTP error ${response.statusCode}: ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  async matricular(users: MoodleUser[], courseid: number) {
    if (users.length === 0) return;

    const body = new URLSearchParams();

    body.append("wstoken", env.TI.TOKEN_MOODLE);
    body.append("moodlewsrestformat", "json");
    body.append("wsfunction", "enrol_manual_enrol_users");

    users.forEach((a, x) => {
      const roleid = a.roles?.[0]?.roleid;

      if (!roleid) {
        throw new Error(`El usuario Moodle ${a.id} no tiene roleid.`);
      }

      body.append(`enrolments[${x}][courseid]`, String(courseid));
      body.append(`enrolments[${x}][userid]`, String(a.id));
      body.append(`enrolments[${x}][roleid]`, String(roleid));
    });

    const response = await request(env.TI.BASE_MOODLE, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await response.body.text();

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Moodle HTTP error ${response.statusCode}: ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }
}
