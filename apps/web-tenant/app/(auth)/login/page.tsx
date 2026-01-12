"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { LoginForm } from "@/components/forms/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6 animate-fade-up">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-accent" />
          Presence360
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold text-foreground md:text-5xl">
            Attendance that feels personal.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Sign in to review live arrivals, manage follow-ups, and keep every member
            seen. Your church data stays isolated, encrypted, and ready for action.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { title: "Live signals", description: "Realtime arrivals, zero video storage" },
            { title: "Consent-first", description: "Opt-outs delete profiles immediately" },
            { title: "Follow-up ready", description: "Automated absence and welcome flows" },
            { title: "Secure by design", description: "Dedicated DB and audit logs" },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border bg-card/80 p-4 text-sm shadow-card"
            >
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>

      <Card className="border-none bg-card/90 shadow-glow animate-fade-up">
        <CardHeader>
          <CardTitle>Tenant sign in</CardTitle>
          <CardDescription>Use your church admin credentials to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
