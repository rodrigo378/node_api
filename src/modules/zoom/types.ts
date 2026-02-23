// export type ZoomTokenResponse = {
export type ZoomTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  api_url: string;
};

export type ZoomUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  email?: string;
  type?: number;
  timezone?: string;
  status?: string;
  created_at?: string;
  last_login_time?: string;
};

export type ZoomUsersResponse = {
  page_count: number;
  page_number: number;
  page_size: number;
  total_records: number;
  users: ZoomUser[];
};

export interface ZoomMeeting {
  uuid: string;
  id: number;
  host_id: string;
  type: number;

  topic: string;
  user_name: string;
  user_email: string;

  start_time: string;
  end_time: string;

  duration: number;
  total_minutes: number;
  participants_count: number;

  source: string;
}

export interface ZoomMeetingsReportResponse {
  from: string;
  to: string;

  page_count: number;
  page_size: number;
  total_records: number;

  next_page_token?: string;

  meetings: ZoomMeeting[];
}

export interface ZoomTrackingField {
  field: string;
  value: string;
}

export interface ZoomMeetingReportItem {
  uuid: string;
  id: number;
  host_id: string;
  type: number;

  topic: string;
  user_name: string;
  user_email: string;

  start_time: string;
  end_time: string;

  duration: number;
  total_minutes: number;
  participants_count: number;

  tracking_fields?: ZoomTrackingField[];
  dept?: string;
}

export interface ZoomMeetingParticipant {
  id: string;
  user_id: string;
  name: string;
  user_email: string;
  join_time: string;
  leave_time: string;
  duration: number;
  attentiveness_score: string;
  failover: boolean;
  status: "in_meeting" | "in_waiting_room";
  groupId: string;
  customer_key: string;
  participant_user_id?: string;
}

export interface ZoomMeetingParticipantsResponse {
  page_count: number;
  page_size: number;
  total_records: number;
  next_page_token: string;
  participants: ZoomMeetingParticipant[];
}
