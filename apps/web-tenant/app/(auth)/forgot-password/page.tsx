"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Card className="border-none bg-card/90 shadow-glow">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Password resets are managed by your church administrator. Submit your email so
            they can assist you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <Input type="email" placeholder="you@church.org" />
          </div>
          <Button className="w-full" disabled>
            Submit request
          </Button>
          <Link href="/login" className="text-xs font-semibold text-primary">
            Back to login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
