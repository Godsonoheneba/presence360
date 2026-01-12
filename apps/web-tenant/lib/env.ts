export const env = {
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? "dev",
  tenantApiBaseUrl:
    process.env.NEXT_PUBLIC_TENANT_API_BASE_URL ?? "http://localhost:8000",
  controlPlaneApiBaseUrl:
    process.env.NEXT_PUBLIC_CONTROL_PLANE_API_BASE_URL ?? "http://localhost:8001",
  devTenantSlug: process.env.NEXT_PUBLIC_DEV_TENANT_SLUG ?? "",
  devAuthToken: process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN ?? "",
};

export const isDev = env.appEnv === "dev";
