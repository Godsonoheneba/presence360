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
          <CardTitle>Request admin reset</CardTitle>
          <CardDescription>
            Control plane access is managed through super admin tokens. Contact the
            platform owner to rotate or reissue credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Admin email
            </label>
            <Input type="email" placeholder="ops@presence360.app" />
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
