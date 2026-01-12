import { env } from "@/lib/env";
import { authEvents } from "@/lib/auth-events";
import { getAccessToken } from "@/lib/session";

export type ApiErrorDetails = {
  status: number;
  message: string;
  requestId?: string;
};

export class ApiError extends Error {
  status: number;
  requestId?: string;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.status = details.status;
    this.requestId = details.requestId;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  skipAuth?: boolean;
};

const DEFAULT_TIMEOUT_MS = 12000;

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (!options.skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ApiError({
      status: response.status,
      message: "Invalid JSON response",
      requestId: response.headers.get("x-request-id") ?? undefined,
    });
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const baseUrl = env.controlPlaneApiBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: buildHeaders(options),
      body: options.body instanceof FormData ? options.body : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw new ApiError({
      status: 0,
      message: error instanceof Error ? error.message : "Network error",
    });
  }
  clearTimeout(timeout);

  const requestId = response.headers.get("x-request-id") ?? undefined;

  if (response.status === 401) {
    authEvents.emitUnauthorized();
  }

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const payload = await parseResponse<{ detail?: string }>(response);
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError({ status: response.status, message: detail, requestId });
  }

  return parseResponse<T>(response);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
