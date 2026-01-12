"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = String(params.id ?? "");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<Tenant>(`/v1/tenants/${tenantId}`);
        setTenant({ ...response, id: tenantId });
      } catch {
        setTenant({ id: tenantId });
      } finally {
        setLoading(false);
      }
    };
    if (tenantId) {
      load();
    }
  }, [tenantId]);

  const runAction = async (action: string, path: string) => {
    setActionLoading(action);
    try {
      await api.post(path, {});
      toast.success(`${action} complete`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${action} failed`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenant details"
        description="Inspect provisioning state and run control actions."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading === "Suspend"}
              onClick={() => runAction("Suspend", `/v1/tenants/${tenantId}/suspend`)}
            >
              Suspend
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading === "Unsuspend"}
              onClick={() => runAction("Unsuspend", `/v1/tenants/${tenantId}/unsuspend`)}
            >
              Unsuspend
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading === "Rotate"}
              onClick={() => runAction("Rotate", `/v1/tenants/${tenantId}/rotate-secrets`)}
            >
              Rotate secrets
            </Button>
          </div>
        }
      />

      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                <span className="text-xs uppercase tracking-[0.2em]">Tenant ID</span>
                <p className="mt-1 text-foreground">{tenant?.id}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-[0.2em]">Slug</span>
                <p className="mt-1 text-foreground">{tenant?.slug ?? "-"}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-[0.2em]">Status</span>
                <p className="mt-1 text-foreground">{tenant?.status ?? "unknown"}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-[0.2em]">Provisioning</span>
                <p className="mt-1 text-foreground">
                  {tenant?.provisioning_state ?? "unknown"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionLoading === "Health"}
                  onClick={() => runAction("Health", `/v1/tenants/${tenantId}/health`)}
                >
                  Check health
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actionLoading === "Usage"}
                  onClick={() => runAction("Usage", `/v1/tenants/${tenantId}/usage`)}
                >
                  View usage
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
