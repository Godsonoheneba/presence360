"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleGate } from "@/components/auth/role-gate";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { FollowupTask, Person } from "@/lib/types";

export default function FollowupDetailPage() {
  const params = useParams();
  const taskId = String(params.id ?? "");

  const { data: followupsResponse, isLoading } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api.get<{ items: FollowupTask[] }>("/v1/followups"),
  });
  const { data: peopleResponse } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
  });

  const task = followupsResponse?.items?.find((item) => item.id === taskId) ?? null;
  const peopleMap = (peopleResponse?.items ?? []).reduce<Record<string, Person>>((acc, person) => {
    acc[person.id] = person;
    return acc;
  }, {});
  const personLabel = task?.person_id ? peopleMap[task.person_id]?.full_name : null;

  const markResolved = useMutation({
    mutationFn: async () => api.patch(`/v1/followups/${taskId}`, { status: "resolved" }),
    onSuccess: () => toast.success("Follow-up marked as resolved"),
    onError: () => toast.error("Update failed"),
  });

  return (
    <PageShell
      title="Follow-up task"
      description="Follow-up details and assignment tracking."
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Follow-ups", href: "/followups" },
        { label: personLabel ?? "Follow-up" },
      ]}
      action={
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/followups">Back</Link>
          </Button>
          <RoleGate permissions={["followups.update"]}>
            <Button
              onClick={() => markResolved.mutate()}
              disabled={markResolved.isPending || task?.status === "resolved"}
            >
              {markResolved.isPending ? "Updating..." : "Mark resolved"}
            </Button>
          </RoleGate>
        </div>
      }
    >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !task ? (
            <EmptyState title="Task not found" description="No follow-up task found." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                <Badge className="mt-2">{task.status ?? "open"}</Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Due</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDateTime(task.due_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Priority</p>
                <p className="mt-2 text-sm text-muted-foreground">{task.priority ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Person</p>
                {task.person_id ? (
                  <Link
                    href={`/people/${task.person_id}`}
                    className="mt-2 inline-flex text-xs font-semibold text-primary"
                  >
                    {personLabel ?? "View person"}
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">-</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
