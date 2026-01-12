"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Tenant, TenantListResponse } from "@/lib/types";

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<TenantListResponse>("/v1/tenants");
        setTenants(response.items ?? []);
      } catch {
        setTenants([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="Provisioned churches and their provisioning state."
        action={
          <Link href="/tenants/new" className={buttonVariants()}>
            Create tenant
          </Link>
        }
        className="animate-fade-up"
      />
      <Card className="bg-card/90 animate-fade-up">
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No tenants created yet. Create the first church to begin.
              </p>
              <Link
                href="/tenants/new"
                className={buttonVariants({ variant: "outline" })}
              >
                Provision a tenant
              </Link>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "slug", header: "Slug" },
                { key: "name", header: "Name" },
                {
                  key: "provisioning_state",
                  header: "State",
                  render: (value) => (
                    <Badge
                      variant={value === "active" ? "success" : value === "failed" ? "danger" : "default"}
                    >
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
                { key: "id", header: "Tenant ID" },
              ]}
              data={tenants}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
