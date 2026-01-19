export type LoginResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

export type MeResponse = {
  user?:
    | {
        id?: string;
        name?: string;
        email?: string;
        roles?: string[];
        permissions?: string[];
      }
    | string;
  roles?: string[];
  permissions?: string[];
};

export type Person = {
  id: string;
  full_name?: string;
  consent_status?: string;
  phone?: string | null;
};

export type TenantConfigItem = {
  key: string;
  value: unknown;
};

export type Location = {
  id: string;
  name?: string;
  address?: string | null;
};

export type Gate = {
  id: string;
  name?: string;
  status?: string;
};

export type Camera = {
  id: string;
  name?: string;
  gate_id?: string | null;
  rtsp_url?: string | null;
};

export type Service = {
  id: string;
  name?: string;
  location_id?: string | null;
  status?: string;
};

export type ServiceSession = {
  id: string;
  service_id?: string | null;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
};

export type VisitEvent = {
  id?: string;
  captured_at?: string;
  gate_id?: string;
  person_id?: string | null;
};

export type RecognitionResult = {
  frame_id?: string;
  gate_id?: string;
  person_id?: string | null;
  decision?: string;
  best_confidence?: number | null;
  best_face_id?: string | null;
  rejection_reason?: string | null;
  processed_at?: string;
};

export type Template = {
  id: string;
  name?: string;
  channel?: string;
  body?: string;
  variables_json?: string[];
  active?: boolean;
};

export type MessageLog = {
  id: string;
  person_id?: string | null;
  template_id?: string | null;
  channel: string;
  status: string;
  provider_message_id?: string | null;
  sent_at?: string | null;
  error_code?: string | null;
};

export type Rule = {
  id: string;
  name?: string;
  status?: string;
  rule_type?: string;
  config?: Record<string, unknown>;
};

export type FollowupTask = {
  id: string;
  person_id?: string;
  rule_id?: string | null;
  status?: string;
  priority?: string | null;
  due_at?: string | null;
};

export type User = {
  id: string;
  email: string;
  status?: string;
  roles?: string[];
  location_ids?: string[];
  created_at?: string | null;
};

export type Role = {
  id: string;
  name: string;
  description?: string | null;
  permissions?: string[];
};

export type Permission = {
  id: string;
  name: string;
  description?: string | null;
};
