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
};

export type FollowupTask = {
  id: string;
  person_id?: string;
  rule_id?: string | null;
  status?: string;
  priority?: string | null;
  due_at?: string | null;
};
