"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { isDev } from "@/lib/env";
import type { Tenant } from "@/lib/types";

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = String(params.id ?? "");

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenants", tenantId],
    queryFn: () => api.get<Tenant>(`/v1/tenants/${tenantId}`),
    enabled: Boolean(tenantId),
  });

  const { data: health } = useQuery({
    queryKey: ["tenant-health", tenantId],
    queryFn: () => api.get<Record<string, unknown>>(`/v1/tenants/${tenantId}/health`),
    enabled: Boolean(tenantId),
  });

  const { data: usage } = useQuery({
    queryKey: ["tenant-usage", tenantId],
    queryFn: () => api.get<Record<string, unknown>>(`/v1/tenants/${tenantId}/usage`),
    enabled: Boolean(tenantId),
  });

  const suspend = useMutation({
    mutationFn: async () => api.post(`/v1/tenants/${tenantId}/suspend`, {}),
    onSuccess: () => toast.success("Tenant suspended"),
    onError: () => toast.error("Unable to suspend tenant"),
  });

  const unsuspend = useMutation({
    mutationFn: async () => api.post(`/v1/tenants/${tenantId}/unsuspend`, {}),
    onSuccess: () => toast.success("Tenant unsuspended"),
    onError: () => toast.error("Unable to unsuspend tenant"),
  });

  const rotateSecrets = useMutation({
    mutationFn: async () => api.post(`/v1/tenants/${tenantId}/rotate-secrets`, {}),
    onSuccess: () => toast.success("Secret rotation queued"),
    onError: () => toast.error("Unable to rotate secrets"),
  });

  return (
    <PageShell
      title="Tenant details"
      description="Inspect provisioning state and run control actions."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Tenants", href: "/tenants" },
        { label: tenant?.name ?? tenant?.slug ?? "Tenant" },
      ]}
      action={
        <Button asChild variant="outline">
          <Link href="/tenants">Back</Link>
        </Button>
      }
    >
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : !tenant ? (
                <EmptyState title="Tenant not found" description="No tenant record available." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tenant</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {tenant.name ?? "Tenant"}
                    </p>
                    <p className="text-xs text-muted-foreground">{tenant.slug ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Created</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDateTime(tenant.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tenant ID</p>
                    <p className="mt-2 text-sm text-muted-foreground">{tenant.id}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                    <Badge className="mt-2">{tenant.status ?? "unknown"}</Badge>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Provisioning</p>
                    <Badge className="mt-2">{tenant.provisioning_state ?? "unknown"}</Badge>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tenant access</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {tenant.slug ? (
                        <Link
                          href={
                            isDev
                              ? `http://${tenant.slug}.localtest.me:3000`
                              : `https://${tenant.slug}.presence360.app`
                          }
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Open tenant app
                        </Link>
                      ) : (
                        "Add a slug to enable tenant access"
                      )}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {health ? (
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify(health, null, 2)}
                </pre>
              ) : (
                <EmptyState title="No health data" description="Health checks will appear here." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {usage ? (
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify(usage, null, 2)}
                </pre>
              ) : (
                <EmptyState title="No usage data" description="Usage metrics will appear here." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card className="bg-card/90">
            <CardContent className="flex flex-wrap gap-2 pt-5">
              <ConfirmDialog
                trigger={<Button variant="outline">Suspend</Button>}
                title="Suspend tenant"
                description="Suspended tenants cannot access the platform."
                destructive
                onConfirm={() => suspend.mutate()}
              />
              <ConfirmDialog
                trigger={<Button variant="outline">Unsuspend</Button>}
                title="Unsuspend tenant"
                description="Restores tenant access immediately."
                onConfirm={() => unsuspend.mutate()}
              />
              <ConfirmDialog
                trigger={<Button variant="outline">Rotate secrets</Button>}
                title="Rotate secrets"
                description="Generate new DB and provider credentials."
                onConfirm={() => rotateSecrets.mutate()}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
