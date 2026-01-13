import { getAccessToken } from "@/lib/session";
import { env, isDev } from "@/lib/env";

export async function downloadCsv(path: string, filename: string) {
  const baseUrl = env.tenantApiBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (isDev && env.devTenantSlug) {
    headers["X-Tenant-Slug"] = env.devTenantSlug;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
