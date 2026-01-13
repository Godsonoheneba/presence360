"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  MonitorPlay,
  Settings,
  Users,
  Workflow,
  Activity,
  FileText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { hasAccess } from "@/lib/permissions";

type NavItem = {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  permissions?: string[];
  roles?: string[];
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard },
      {
        title: "Live attendance",
        href: "/live-attendance",
        icon: Activity,
        permissions: ["attendance.read"],
      },
    ],
  },
  {
    label: "Service Day",
    items: [
      {
        title: "Services",
        href: "/services",
        icon: MonitorPlay,
        permissions: ["services.read"],
      },
      {
        title: "Sessions",
        href: "/sessions",
        icon: ClipboardList,
        permissions: ["attendance.read"],
      },
      {
        title: "Attendance",
        href: "/attendance",
        icon: Activity,
        permissions: ["attendance.read"],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        title: "People",
        href: "/people",
        icon: Users,
        permissions: ["people.read"],
      },
      {
        title: "Follow-ups",
        href: "/followups",
        icon: CalendarDays,
        permissions: ["followups.read"],
      },
    ],
  },
  {
    label: "Messaging",
    items: [
      {
        title: "Messages",
        href: "/messages",
        icon: MessageSquare,
        permissions: ["messages.read"],
      },
      {
        title: "Templates",
        href: "/templates",
        icon: FileText,
        permissions: ["messages.manage"],
      },
      {
        title: "Rules",
        href: "/rules",
        icon: Workflow,
        permissions: ["rules.read"],
      },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        title: "Onboarding",
        href: "/onboarding",
        icon: Settings,
        roles: ["ChurchOwnerAdmin", "BranchAdmin"],
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        roles: ["ChurchOwnerAdmin", "BranchAdmin"],
      },
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
  const { user } = useAuth();

  return (
    <nav className="flex-1 space-y-6 px-3 pb-6">
      {navSections.map((section) => {
        const items = section.items.filter((item) =>
          hasAccess(user, { permissions: item.permissions, roles: item.roles }),
        );
        if (items.length === 0) {
          return null;
        }
        return (
          <div key={section.label} className="space-y-2">
            {!collapsed ? (
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {section.label}
              </p>
            ) : null}
            <div className="space-y-1">
              {items.map((item) => {
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
        );
      })}
    </nav>
  );
}
