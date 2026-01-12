"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PlusCircle, Server } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { title: "Overview", href: "/tenants", icon: LayoutDashboard },
  { title: "Create tenant", href: "/tenants/new", icon: PlusCircle },
  { title: "Health checks", href: "/tenants", icon: Server },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="mt-8 space-y-1">
      {navItems.map((item) => {
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
