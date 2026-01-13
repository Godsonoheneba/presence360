"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileDown } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/download";
import { RoleGate } from "@/components/auth/role-gate";
import type { RecognitionResult, VisitEvent } from "@/lib/types";

export default function AttendanceSessionPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");
  const [exporting, setExporting] = useState(false);

  const { data: attendanceResponse, isLoading } = useQuery({
    queryKey: ["attendance", sessionId],
    queryFn: () => api.get<{ totals?: Record<string, unknown> }>(`/v1/sessions/${sessionId}/attendance`),
    enabled: Boolean(sessionId),
  });

  const { data: eventsResponse } = useQuery({
    queryKey: ["visit-events"],
    queryFn: () => api.get<{ items: VisitEvent[] }>("/v1/visit-events"),
  });

  const { data: recognitionResponse } = useQuery({
    queryKey: ["recognition-results"],
    queryFn: () => api.get<{ items: RecognitionResult[] }>("/v1/recognition-results"),
  });

  const events = eventsResponse?.items ?? [];
  const recognitions = recognitionResponse?.items ?? [];
  const totals = attendanceResponse?.totals ?? {};

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCsv(`/v1/exports/sessions/${sessionId}.csv`, `session-${sessionId}.csv`);
      toast.success("Export started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PermissionGate permissions={["attendance.read"]}>
      <PageShell
        title="Session detail"
        description="Rollups, arrivals, and recognition results for this service session."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Attendance", href: "/attendance" },
          { label: sessionId },
        ]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/attendance">Back</Link>
            </Button>
            <RoleGate permissions={["attendance.export"]}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exporting}>
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExport}>
                    <FileDown className="h-4 w-4" />
                    Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </RoleGate>
          </div>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Session ID</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{sessionId}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Totals</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {Object.keys(totals).length > 0 ? JSON.stringify(totals) : "No totals yet"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                <Badge className="mt-2">Live</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="arrivals">
        <TabsList>
          <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
          <TabsTrigger value="recognition">Recognition</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="arrivals">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {events.length === 0 ? (
                <EmptyState
                  title="No visit events"
                  description="Visit events will show up here as the gate agent streams frames."
                />
              ) : (
                <DataTable
                  columns={[
                    { key: "id", header: "Event ID" },
                    {
                      key: "person_id",
                      header: "Person",
                      render: (value) => (value ? "Matched" : "Unknown"),
                    },
                    { key: "captured_at", header: "Captured" },
                  ]}
                  data={events}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recognition">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              {recognitions.length === 0 ? (
                <EmptyState
                  title="No recognition results"
                  description="Recognition results appear as frames are processed."
                />
              ) : (
                <DataTable
                  columns={[
                    { key: "frame_id", header: "Frame" },
                    {
                      key: "decision",
                      header: "Decision",
                      render: (value) => (
                        <Badge variant={value === "matched" ? "success" : "default"}>
                          {String(value ?? "unknown")}
                        </Badge>
                      ),
                    },
                    { key: "best_confidence", header: "Confidence" },
                    { key: "processed_at", header: "Processed" },
                  ]}
                  data={recognitions}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export">
          <Card className="bg-card/90">
            <CardContent className="pt-5">
              <EmptyState
                title="Export session data"
                description="Download attendance rollups and visit events for this session."
                action={
                  <Button onClick={handleExport} disabled={exporting}>
                    Export CSV
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </PageShell>
    </PermissionGate>
  );
}
