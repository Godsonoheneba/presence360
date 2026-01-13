"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

export default function AdminActionsPage() {
  const [tenantId, setTenantId] = useState("");
  const [reason, setReason] = useState("");

  const startImpersonation = useMutation({
    mutationFn: async () => api.post("/v1/support/impersonate", { tenant_id: tenantId, reason }),
    onSuccess: () => toast.success("Impersonation started"),
    onError: () => toast.error("Unable to start impersonation"),
  });

  const endImpersonation = useMutation({
    mutationFn: async () => api.post("/v1/support/impersonate/end", { tenant_id: tenantId }),
    onSuccess: () => toast.success("Impersonation ended"),
    onError: () => toast.error("Unable to end impersonation"),
  });

  return (
    <PageShell
      title="Admin actions"
      description="Support sessions and break-glass access with full audit logging."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admin actions" }]}
    >
      <Card className="bg-card/90">
        <CardContent className="space-y-4 pt-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tenant ID
            </label>
            <Input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="Tenant UUID"
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reason
            </label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required justification"
              className="mt-2"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => startImpersonation.mutate()} disabled={!tenantId}>
              Start impersonation
            </Button>
            <Button variant="outline" onClick={() => endImpersonation.mutate()} disabled={!tenantId}>
              End impersonation
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
