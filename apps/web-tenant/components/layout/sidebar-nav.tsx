"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, MessageSquare, Users, Workflow } from "lucide-react";

import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";

const navItems = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "People",
    href: "/people",
    icon: Users,
    permission: "people.read",
  },
  {
    title: "Messages",
    href: "/messages/logs",
    icon: MessageSquare,
    permission: "messages.read",
  },
  {
    title: "Rules",
    href: "/rules",
    icon: Workflow,
    permission: "rules.read",
  },
  {
    title: "Follow-ups",
    href: "/followups",
    icon: CalendarDays,
    permission: "followups.read",
  },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const permissions = user?.permissions;

  return (
    <nav className="mt-8 space-y-1">
      {navItems
        .filter((item) => hasPermission(permissions, item.permission))
        .map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                active && "bg-muted text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
    </nav>
  );
}
