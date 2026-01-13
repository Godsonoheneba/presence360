"use client";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Card className="border-none bg-card/90 shadow-glow">
        <CardHeader>
          <CardTitle>Rotate admin token</CardTitle>
          <CardDescription>
            This environment uses token-based authentication. Use the control plane to
            rotate secrets when a reset is needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rotation reference
            </label>
            <Input placeholder="Rotation request ID" />
          </div>
          <Button className="w-full" disabled>
            Confirm rotation
          </Button>
          <Link href="/login" className="text-xs font-semibold text-primary">
            Back to login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
