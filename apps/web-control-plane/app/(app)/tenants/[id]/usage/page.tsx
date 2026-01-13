"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

export default function TenantUsagePage() {
  const params = useParams();
  const tenantId = String(params.id ?? "");

  const { data: usage, isLoading } = useQuery({
    queryKey: ["tenant-usage", tenantId],
    queryFn: () => api.get<Record<string, unknown>>(`/v1/tenants/${tenantId}/usage`),
    enabled: Boolean(tenantId),
  });

  return (
    <PageShell
      title="Tenant usage"
      description="Usage metrics for this tenant."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Tenants", href: "/tenants" },
        { label: tenantId, href: `/tenants/${tenantId}` },
        { label: "Usage" },
      ]}
      action={
        <Button asChild variant="outline">
          <Link href={`/tenants/${tenantId}`}>Back</Link>
        </Button>
      }
    >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              {usage ? JSON.stringify(usage, null, 2) : "No usage data yet."}
            </pre>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
