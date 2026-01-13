"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutDashboard, PlusCircle, Server, Shield } from "lucide-react";

import { cn } from "@/lib/utils";

const navSections = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Activity", href: "/activity", icon: Activity },
    ],
  },
  {
    label: "Tenants",
    items: [
      { title: "All tenants", href: "/tenants", icon: Server },
      { title: "Create tenant", href: "/tenants/new", icon: PlusCircle },
    ],
  },
  {
    label: "Security",
    items: [
      { title: "Admin actions", href: "/admin-actions", icon: Shield },
    ],
  },
];

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-6 px-3 pb-6">
      {navSections.map((section) => (
        <div key={section.label} className="space-y-2">
          {!collapsed ? (
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {section.label}
            </p>
          ) : null}
          <div className="space-y-1">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                    active && "bg-muted text-foreground",
                    collapsed && "justify-center",
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {!collapsed ? item.title : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
