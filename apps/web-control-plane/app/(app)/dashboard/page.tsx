"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { LineChartCard } from "@/components/charts/line-chart";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Tenant } from "@/lib/types";

function buildSeries(values: Tenant[]) {
  if (!values.length) {
    const today = new Date();
    return Array.from({ length: 6 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (5 - index));
      return {
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: 0,
      };
    });
  }
  return values.slice(0, 6).map((tenant, index) => ({
    label: tenant.slug ?? tenant.name ?? `Tenant ${index + 1}`,
    value: index + 1,
  }));
}

export default function ControlDashboard() {
  const { data: tenantsResponse, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.get<{ items: Tenant[] }>("/v1/tenants"),
  });

  const tenants = useMemo(() => tenantsResponse?.items ?? [], [tenantsResponse?.items]);
  const totals = useMemo(() => {
    const active = tenants.filter((tenant) => tenant.status === "active").length;
    const suspended = tenants.filter((tenant) => tenant.status === "suspended").length;
    return {
      total: tenants.length,
      active,
      suspended,
    };
  }, [tenants]);

  const growthSeries = useMemo(() => buildSeries(tenants), [tenants]);

  return (
    <PageShell
      title="Control plane"
      description="Global tenant health, provisioning, and operational insight."
      breadcrumbs={[{ label: "Dashboard" }]}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total tenants" value={totals.total} />
        <StatCard label="Active" value={totals.active} />
        <StatCard label="Suspended" value={totals.suspended} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Tenant growth</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <>
                <LineChartCard
                  data={growthSeries.map((item) => ({ label: item.label, value: item.value }))}
                  series={[{ key: "value", color: "hsl(var(--primary))" }]}
                />
                {tenants.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">No tenant growth yet.</p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Provisioning outcomes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : tenants.length === 0 ? (
              <EmptyState
                title="No provisioning activity"
                description="Provisioning events will appear once tenants are created."
              />
            ) : (
              tenants.slice(0, 5).map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {tenant.name ?? tenant.slug ?? "Tenant"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tenant.slug ?? "no slug"}
                    </p>
                  </div>
                  <Badge variant={tenant.provisioning_state === "active" ? "success" : "default"}>
                    {tenant.provisioning_state ?? "unknown"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : tenants.length === 0 ? (
            <EmptyState title="No activity yet" description="Recent tenant actions will show here." />
          ) : (
            <div className="space-y-3">
              {tenants.slice(0, 4).map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {tenant.name ?? tenant.slug ?? "Tenant"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(tenant.created_at) || "Tenant created"}
                    </p>
                  </div>
                  <Badge variant="default">Provisioned</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
