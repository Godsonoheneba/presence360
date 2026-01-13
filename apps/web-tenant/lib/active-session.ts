import { resolveTenantSlug } from "@/lib/tenant";

const KEY_BASE = "presence360:active-session";

function keyFor() {
  const slug = resolveTenantSlug(typeof window === "undefined" ? undefined : window.location.hostname);
  return `${KEY_BASE}:${slug ?? "default"}`;
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(keyFor());
}

export function setActiveSessionId(sessionId: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!sessionId) {
    window.localStorage.removeItem(keyFor());
  } else {
    window.localStorage.setItem(keyFor(), sessionId);
  }
}
