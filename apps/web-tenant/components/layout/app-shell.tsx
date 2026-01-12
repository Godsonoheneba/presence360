"use client";

import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { resolveTenantSlug } from "@/lib/tenant";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const tenantSlug = resolveTenantSlug(
    typeof window !== "undefined" ? window.location.hostname : undefined,
  );

  return (
    <div className="min-h-screen">
      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 -translate-x-full border-r border-border bg-card/95 p-6 shadow-xl backdrop-blur transition-transform md:static md:translate-x-0 ${
            open ? "translate-x-0" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Presence360
              </p>
              <p className="text-lg font-semibold text-foreground">Tenant Console</p>
              {tenantSlug ? (
                <p className="mt-1 text-xs text-muted-foreground">{tenantSlug}</p>
              ) : null}
            </div>
            <button
              className="rounded-md p-2 text-muted-foreground md:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Signed in</p>
            <p className="mt-1">{user?.name ?? user?.email ?? "Tenant user"}</p>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card/70 px-6 py-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  Live Attendance
                </p>
                <h1 className="font-display text-lg font-semibold text-foreground">
                  Welcome back
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <p className="text-[10px] uppercase tracking-[0.2em]">Role</p>
                <p className="font-medium text-foreground">{user?.roles?.[0] ?? "Staff"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          </header>

          <main className="flex-1 px-6 py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
