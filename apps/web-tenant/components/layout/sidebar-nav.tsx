"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { hasAccess } from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
        permissions: ["services.manage"],
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
        permissions: ["services.manage"],
      },
      {
        title: "Sessions",
        href: "/sessions",
        icon: ClipboardList,
        permissions: ["services.manage"],
      },
      {
        title: "Attendance",
        href: "/attendance",
        icon: Activity,
        permissions: ["reports.read"],
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
        permissions: ["followups.manage"],
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
        permissions: ["messages.send"],
      },
      {
        title: "Templates",
        href: "/templates",
        icon: FileText,
        permissions: ["messages.send"],
      },
      {
        title: "Rules",
        href: "/rules",
        icon: Workflow,
        permissions: ["config.manage"],
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
        permissions: ["config.manage"],
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        permissions: ["config.manage"],
      },
      {
        title: "Users",
        href: "/users",
        icon: Users,
        permissions: ["users.manage"],
      },
      {
        title: "Roles & permissions",
        href: "/roles",
        icon: ShieldCheck,
        permissions: ["users.manage"],
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
  const router = useRouter();
  const { user } = useAuth();

  return (
    <TooltipProvider>
    <nav className="flex-1 space-y-6 px-3 pb-6">
      {navSections.map((section) => {
        const items = section.items;
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
                const canAccess = hasAccess(user, { permissions: item.permissions, roles: item.roles });
                const requires = [
                  ...(item.permissions ?? []),
                  ...(item.roles ?? []).map((role) => `role ${role}`),
                ];
                const content = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.title}
                    onClick={(event) => {
                      if (!canAccess) {
                        event.preventDefault();
                        return;
                      }
                      onNavigate?.();
                    }}
                    onMouseEnter={() => router.prefetch(item.href)}
                    aria-disabled={!canAccess}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active && "bg-muted text-foreground",
                      !active && "text-muted-foreground hover:text-foreground",
                      !canAccess && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
                      collapsed && "justify-center",
                    )}
                    title={collapsed ? item.title : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {!collapsed ? item.title : null}
                  </Link>
                );
                if (canAccess) {
                  return content;
                }
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{content}</TooltipTrigger>
                    <TooltipContent>
                      Requires {requires.length ? requires.join(", ") : "additional access"}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
    </TooltipProvider>
  );
}
