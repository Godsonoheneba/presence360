"use client";

import { useState } from "react";
import { toast } from "sonner";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { isDev } from "@/lib/env";

export function LoginForm() {
  const { login, devToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devTokenInput, setDevTokenInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await login({ email, password, devTokenOverride: devTokenInput });
      toast.success("Signed in");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to sign in. Check your token.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Email
        </label>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@church.org"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Password
        </label>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Link href="/forgot-password" className="font-semibold text-primary">
          Forgot password?
        </Link>
        <span>Support reset required</span>
      </div>
      {isDev ? (
        <div className="rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Dev auth enabled</p>
          <p className="mt-1">
            Configure NEXT_PUBLIC_DEV_AUTH_TOKEN to avoid manual token entry.
          </p>
          {!devToken ? (
            <div className="mt-3 space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Dev token
              </label>
              <Input
                type="password"
                value={devTokenInput}
                onChange={(event) => setDevTokenInput(event.target.value)}
                placeholder="Paste dev token"
              />
            </div>
          ) : (
            <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Token loaded
            </p>
          )}
        </div>
      ) : null}
    </form>
  );
}
