"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isDev } from "@/lib/env";

export function LoginForm() {
  const { login, devToken } = useAuth();
  const [token, setToken] = useState(devToken ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await login(token);
      toast.success("Authenticated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Admin token
        </label>
        <Input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste dev super token"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
      {isDev ? (
        <p className="text-xs text-muted-foreground">
          Dev-only auth is enabled. Set NEXT_PUBLIC_DEV_SUPER_TOKEN for one-click
          access.
        </p>
      ) : null}
    </form>
  );
}
