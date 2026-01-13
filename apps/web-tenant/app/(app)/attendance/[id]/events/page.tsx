"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import type { VisitEvent } from "@/lib/types";

export default function VisitEventsPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");

  const { data: eventsResponse, isLoading } = useQuery({
    queryKey: ["visit-events"],
    queryFn: () => api.get<{ items: VisitEvent[] }>("/v1/visit-events"),
  });

  const events = eventsResponse?.items ?? [];

  return (
    <PermissionGate permissions={["attendance.read"]}>
      <PageShell
        title="Visit events"
        description="Raw event stream for this session."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Attendance", href: "/attendance" },
          { label: sessionId, href: `/attendance/${sessionId}` },
          { label: "Events" },
        ]}
        action={
          <Button asChild variant="outline">
            <Link href={`/attendance/${sessionId}`}>Back</Link>
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : events.length === 0 ? (
            <EmptyState title="No visit events" description="Events will show here as gates stream frames." />
          ) : (
            <DataTable
              columns={[
                { key: "id", header: "Event ID" },
                {
                  key: "person_id",
                  header: "Decision",
                  render: (value) => (
                    <Badge variant={value ? "success" : "default"}>
                      {value ? "matched" : "unknown"}
                    </Badge>
                  ),
                },
                { key: "captured_at", header: "Captured" },
              ]}
              data={events}
            />
          )}
        </CardContent>
      </Card>
      </PageShell>
    </PermissionGate>
  );
}
