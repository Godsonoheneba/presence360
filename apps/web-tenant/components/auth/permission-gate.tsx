"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";
import { hasAccess } from "@/lib/permissions";
import { ForbiddenState } from "@/components/ui/forbidden-state";

export function PermissionGate({
  children,
  permissions,
  roles,
  fallback,
}: {
  children: ReactNode;
  permissions?: string[];
  roles?: string[];
  fallback?: ReactNode;
}) {
  const { user, status } = useAuth();
  if (status === "loading") {
    return <>{fallback ?? null}</>;
  }
  if (!hasAccess(user, { permissions, roles })) {
    return <>{fallback ?? <ForbiddenState />}</>;
  }
  return <>{children}</>;
}
