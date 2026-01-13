"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import type { FollowupTask } from "@/lib/types";

export default function FollowupsPage() {
  const [search, setSearch] = useState("");
  const { data: followupsResponse, isLoading } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api.get<{ items: FollowupTask[] }>("/v1/followups"),
  });

  const tasks = useMemo(() => followupsResponse?.items ?? [], [followupsResponse?.items]);
  const filtered = useMemo(() => {
    if (!search) {
      return tasks;
    }
    return tasks.filter((task) => task.person_id?.includes(search));
  }, [tasks, search]);

  return (
    <PermissionGate permissions={["followups.read"]}>
      <PageShell
        title="Follow-ups"
        description="Tasks triggered by welcome and absence rules."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Follow-ups" }]}
      >
      <Card className="bg-card/90">
        <CardContent className="pt-6">
          <Input
            placeholder="Search by person id"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-xs"
          />
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
              title="No follow-up tasks"
              description="Absence and welcome rules will generate tasks automatically."
            />
          ) : (
            <DataTable
              columns={[
                { key: "id", header: "Task" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "open" ? "success" : "default"}>
                      {String(value ?? "open")}
                    </Badge>
                  ),
                },
                { key: "due_at", header: "Due" },
                {
                  key: "id",
                  header: "",
                  render: (value) => (
                    <Link
                      href={`/followups/${value}`}
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
    </PermissionGate>
  );
}
