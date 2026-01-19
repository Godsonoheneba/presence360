"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { FollowupTask, Person } from "@/lib/types";

export default function FollowupsPage() {
  const { data: followupsResponse, isLoading } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api.get<{ items: FollowupTask[] }>("/v1/followups"),
  });
  const { data: peopleResponse } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
  });

  const tasks = useMemo(() => followupsResponse?.items ?? [], [followupsResponse?.items]);
  const filtered = useMemo(() => tasks, [tasks]);
  const peopleMap = useMemo(() => {
    const items = peopleResponse?.items ?? [];
    return Object.fromEntries(items.map((person) => [person.id, person]));
  }, [peopleResponse?.items]);

  return (
    <PermissionGate permissions={["followups.manage"]}>
      <PageShell
        title="Follow-ups"
        description="Tasks triggered by welcome and absence rules."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Follow-ups" }]}
      >
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
              searchKeys={["person_id", "status"]}
              columns={[
                {
                  key: "person_id",
                  header: "Person",
                  render: (value) => {
                    if (!value) {
                      return "Unknown";
                    }
                    const person = peopleMap[String(value)];
                    return person?.full_name || "Person";
                  },
                },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "open" ? "success" : "default"}>
                      {String(value ?? "open")}
                    </Badge>
                  ),
                },
                {
                  key: "due_at",
                  header: "Due",
                  render: (value) => formatDateTime(value as string | null | undefined),
                },
              ]}
              data={filtered}
              rowActions={(row) => [
                { label: "View task", href: `/followups/${row.id}` },
                {
                  label: "Copy task id",
                  onClick: () => navigator.clipboard.writeText(String(row.id)),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
      </PageShell>
    </PermissionGate>
  );
}
