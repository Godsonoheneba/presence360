"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TopBar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "presence360_sidebar_collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_KEY, String(next));
    }
  };

  return (
    <div className="min-h-screen">
      <div className="flex">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card/95 shadow-xl backdrop-blur transition-all md:static",
            collapsed ? "w-20" : "w-64",
            open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between px-4 py-5">
            <div className={cn("transition-all", collapsed && "opacity-0 md:opacity-100")}> 
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Presence360
              </p>
              <p className="text-lg font-semibold text-foreground">Tenant Console</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex"
                onClick={toggleCollapse}
                aria-label="Toggle sidebar"
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <SidebarNav collapsed={collapsed} onNavigate={() => setOpen(false)} />
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar onToggleSidebar={() => setOpen(true)} />
          <main className="flex-1 px-6 py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
