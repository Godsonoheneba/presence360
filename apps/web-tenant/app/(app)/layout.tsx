"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { configItemsToMap } from "@/lib/config";
import type { TenantConfigItem } from "@/lib/types";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const { data: configResponse } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ items: TenantConfigItem[] }>("/v1/config"),
    enabled: status === "authenticated",
  });
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<{ items: unknown[] }>("/v1/locations"),
    enabled: status === "authenticated",
  });
  const { data: gates } = useQuery({
    queryKey: ["gates"],
    queryFn: () => api.get<{ items: unknown[] }>("/v1/gates"),
    enabled: status === "authenticated",
  });
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ items: unknown[] }>("/v1/services"),
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    if (pathname === "/onboarding") {
      return;
    }
    const configMap = configItemsToMap(configResponse?.items ?? []);
    const onboardingState = (configMap.onboarding_state ?? {}) as {
      completed?: boolean;
      dismissed?: boolean;
    };
    const needsSetup =
      !onboardingState.completed &&
      (locations?.items?.length ?? 0) === 0 &&
      (gates?.items?.length ?? 0) === 0 &&
      (services?.items?.length ?? 0) === 0;
    if (needsSetup && !onboardingState.dismissed) {
      router.replace("/onboarding");
    }
  }, [status, pathname, configResponse?.items, locations?.items, gates?.items, services?.items, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen px-6 py-10">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (status === "anonymous") {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
