"use client";

import { Search, SunMoon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, logout } = useAuth();
  const { mode, setMode, resolved } = useTheme();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card/70 px-6 py-4 backdrop-blur">
      <div className="flex flex-1 items-center gap-3">
        {onToggleSidebar ? (
          <Button variant="ghost" size="sm" onClick={onToggleSidebar}>
            <span className="text-xs uppercase tracking-[0.2em]">Menu</span>
          </Button>
        ) : null}
        <div className="relative hidden w-full max-w-md items-center sm:flex">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search people, messages, or sessions"
            disabled
            aria-label="Search"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SunMoon className="h-4 w-4" />
              {resolved === "dark" ? "Dark" : "Light"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {user?.name ?? user?.email ?? "Tenant user"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
