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
          <CardTitle>Create a new password</CardTitle>
          <CardDescription>
            Password reset tokens are issued by your church admin. If you do not have one,
            contact support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reset token
            </label>
            <Input placeholder="Paste reset token" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              New password
            </label>
            <Input type="password" placeholder="New password" />
          </div>
          <Button className="w-full" disabled>
            Update password
          </Button>
          <Link href="/login" className="text-xs font-semibold text-primary">
            Back to login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
