"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { FollowupTask } from "@/lib/types";

export default function FollowupsPage() {
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<{ items: FollowupTask[] }>("/v1/followups");
        setTasks(response.items ?? []);
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        description="Open tasks for absence and pastoral care workflows."
      />
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No follow-up tasks yet.</p>
          ) : (
            <DataTable
              columns={[
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge
                      variant={
                        value === "open"
                          ? "warning"
                          : value === "closed"
                            ? "success"
                            : "default"
                      }
                    >
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
                { key: "priority", header: "Priority" },
                { key: "due_at", header: "Due" },
                { key: "id", header: "Task ID" },
              ]}
              data={tasks}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
