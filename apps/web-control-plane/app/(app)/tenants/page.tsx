"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Tenant, TenantListResponse } from "@/lib/types";

export default function TenantsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: tenantsResponse, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.get<TenantListResponse>("/v1/tenants"),
  });

  const tenants = useMemo(() => tenantsResponse?.items ?? [], [tenantsResponse?.items]);

  const filtered = useMemo(() => {
    return tenants.filter((tenant) => {
      const nameMatch = !search || (tenant.slug ?? "").toLowerCase().includes(search.toLowerCase());
      const statusMatch = statusFilter === "all" || tenant.status === statusFilter;
      return nameMatch && statusMatch;
    });
  }, [tenants, search, statusFilter]);

  return (
    <PageShell
      title="Tenants"
      description="Provisioned churches and their provisioning state."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tenants" }]}
      action={
        <Button asChild>
          <Link href="/tenants/new">Create tenant</Link>
        </Button>
      }
    >
      <Card className="bg-card/90">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            placeholder="Search by slug"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
          <select
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No tenants yet"
              description="Provision the first church to start onboarding."
              action={
                <Button asChild variant="outline">
                  <Link href="/tenants/new">Provision a tenant</Link>
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={[
                { key: "slug", header: "Slug" },
                { key: "name", header: "Name" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge
                      variant={value === "active" ? "success" : value === "suspended" ? "warning" : "default"}
                    >
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
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
                {
                  key: "id",
                  header: "",
                  render: (value) => (
                    <Link
                      href={`/tenants/${value}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View
                    </Link>
                  ),
                },
              ]}
              data={filtered}
            />
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
