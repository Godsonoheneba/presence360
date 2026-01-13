"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";
import { hasAccess } from "@/lib/permissions";

export function RoleGate({
  children,
  permissions,
  roles,
}: {
  children: ReactNode;
  permissions?: string[];
  roles?: string[];
}) {
  const { user } = useAuth();
  if (!hasAccess(user, { permissions, roles })) {
    return null;
  }
  return <>{children}</>;
}
