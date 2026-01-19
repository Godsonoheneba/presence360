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
  const onMessageRef = useRef(onMessage);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !path) {
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
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

    const connect = () => {
      streamSse(url, {
        headers,
        signal: controller.signal,
        onOpen: () => {
          retryRef.current = 0;
          setStatus("live");
        },
        onEvent: (message) => {
          retryRef.current = 0;
          setStatus("live");
          onMessageRef.current?.(message);
        },
      }).catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setStatus("error");
        retryRef.current += 1;
        const delay = Math.min(15000, 800 * 2 ** retryRef.current);
        setTimeout(() => {
          if (!controller.signal.aborted) {
            setStatus("connecting");
            connect();
          }
        }, delay);
      });
    };

    connect();

    return () => {
      controller.abort();
    };
  }, [enabled, path]);

  return { status };
}
