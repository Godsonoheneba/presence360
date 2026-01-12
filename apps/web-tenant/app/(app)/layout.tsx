"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, router]);

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
