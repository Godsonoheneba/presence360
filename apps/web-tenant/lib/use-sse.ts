"use client";

import { useEffect, useRef, useState } from "react";

import { env, isDev } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { streamSse } from "@/lib/sse";

type SseMessage = {
  event: string;
  data: string;
};

type UseSseOptions = {
  path: string;
  enabled?: boolean;
  onMessage?: (message: SseMessage) => void;
};

export function useSse({ path, enabled = true, onMessage }: UseSseOptions) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const retryRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (isDev && env.devTenantSlug) {
      headers["X-Tenant-Slug"] = env.devTenantSlug;
    }

    const url = `${env.tenantApiBaseUrl.replace(/\/$/, "")}${path}`;
    setStatus("connecting");

    streamSse(url, {
      headers,
      signal: controller.signal,
      onEvent: (message) => {
        retryRef.current = 0;
        setStatus("live");
        onMessage?.(message);
      },
    }).catch(() => {
      if (controller.signal.aborted) {
        return;
      }
      setStatus("error");
      retryRef.current += 1;
      const delay = Math.min(5000, 1000 * retryRef.current);
      setTimeout(() => {
        if (!controller.signal.aborted) {
          setStatus("connecting");
        }
      }, delay);
    });

    return () => {
      controller.abort();
    };
  }, [enabled, onMessage, path]);

  return { status };
}
