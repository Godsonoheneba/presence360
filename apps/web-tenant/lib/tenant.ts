import { env, isDev } from "@/lib/env";

export function resolveTenantSlug(hostname?: string): string | null {
  if (isDev) {
    return env.devTenantSlug || null;
  }
  if (!hostname) {
    return null;
  }
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  return parts[0] ?? null;
}
