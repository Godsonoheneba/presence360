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
import { formatConfidence, formatDateTime, formatSessionLabel } from "@/lib/format";
import type { Gate, Location, Person, RecognitionResult, Service, ServiceSession, VisitEvent } from "@/lib/types";

export default function AttendanceSessionPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");
  const [exporting, setExporting] = useState(false);

  const { data: attendanceResponse, isLoading } = useQuery({
    queryKey: ["attendance", sessionId],
    queryFn: () => api.get<{ totals?: Record<string, unknown> }>(`/v1/sessions/${sessionId}/attendance`),
    enabled: Boolean(sessionId),
  });

  const { data: sessionsResponse } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<{ items: ServiceSession[] }>("/v1/sessions"),
  });
  const { data: servicesResponse } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ items: Service[] }>("/v1/services"),
  });
  const { data: locationsResponse } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<{ items: Location[] }>("/v1/locations"),
  });
  const { data: gatesResponse } = useQuery({
    queryKey: ["gates"],
    queryFn: () => api.get<{ items: Gate[] }>("/v1/gates"),
  });
  const { data: peopleResponse } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<{ items: Person[] }>("/v1/people"),
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
  const sessions = sessionsResponse?.items ?? [];
  const services = servicesResponse?.items ?? [];
  const locations = locationsResponse?.items ?? [];
  const gates = gatesResponse?.items ?? [];
  const people = peopleResponse?.items ?? [];

  const serviceMap = Object.fromEntries(services.map((service) => [service.id, service]));
  const locationMap = Object.fromEntries(locations.map((location) => [location.id, location]));
  const gateMap = Object.fromEntries(gates.map((gate) => [gate.id, gate]));
  const peopleMap = Object.fromEntries(people.map((person) => [person.id, person]));
  const currentSession = sessions.find((item) => item.id === sessionId);
  const sessionLabel = currentSession
    ? formatSessionLabel(currentSession, serviceMap, locationMap)
    : sessionId;
  const sessionStatus = currentSession?.status ?? "scheduled";
  const sessionLocationName = currentSession?.service_id
    ? locationMap[serviceMap[currentSession.service_id]?.location_id ?? ""]?.name
    : undefined;
  const eventRows = events.map((event) => ({
    ...event,
    location_name: sessionLocationName ?? "—",
  }));
  const recognitionRows = recognitions.map((recognition) => ({
    ...recognition,
    location_name: sessionLocationName ?? "—",
  }));

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
    <PermissionGate permissions={["reports.read"]}>
      <PageShell
        title="Session detail"
        description="Rollups, arrivals, and recognition results for this service session."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Attendance", href: "/attendance" },
          { label: sessionLabel },
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
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Session</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{sessionLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Totals</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {Object.keys(totals).length > 0 ? JSON.stringify(totals) : "No totals yet"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                <Badge className="mt-2">{sessionStatus}</Badge>
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
                  searchKeys={["id", "person_id"]}
                  columns={[
                    {
                      key: "person_id",
                      header: "Person",
                      render: (value) => {
                        if (!value) {
                          return "Unknown";
                        }
                        const person = peopleMap[String(value)];
                        return person?.full_name || "Matched";
                      },
                    },
                    {
                      key: "gate_id",
                      header: "Gate",
                      render: (value) => gateMap[String(value)]?.name ?? "Unknown gate",
                    },
                    {
                      key: "location_name",
                      header: "Location",
                      render: (value) => String(value ?? "—"),
                    },
                    {
                      key: "captured_at",
                      header: "Captured",
                      render: (value) => formatDateTime(value as string | null | undefined),
                    },
                  ]}
                  data={eventRows}
                  rowActions={(row) => [
                    {
                      label: "View person",
                      href: row.person_id ? `/people/${row.person_id}` : undefined,
                      disabled: !row.person_id,
                    },
                    {
                      label: "Copy event id",
                      onClick: () => navigator.clipboard.writeText(String(row.id ?? "")),
                      disabled: !row.id,
                    },
                  ]}
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
                  searchKeys={["frame_id", "person_id"]}
                  columns={[
                    {
                      key: "person_id",
                      header: "Person",
                      render: (value) => {
                        if (!value) {
                          return "Unknown";
                        }
                        const person = peopleMap[String(value)];
                        return person?.full_name || "Matched";
                      },
                    },
                    {
                      key: "decision",
                      header: "Decision",
                      render: (value) => (
                        <Badge variant={value === "matched" ? "success" : "default"}>
                          {String(value ?? "unknown")}
                        </Badge>
                      ),
                    },
                    {
                      key: "best_confidence",
                      header: "Confidence",
                      render: (value) => formatConfidence(value as number | null | undefined),
                    },
                    {
                      key: "location_name",
                      header: "Location",
                      render: (value) => String(value ?? "—"),
                    },
                    {
                      key: "processed_at",
                      header: "Processed",
                      render: (value) => formatDateTime(value as string | null | undefined),
                    },
                  ]}
                  data={recognitionRows}
                  rowActions={(row) => [
                    {
                      label: "View person",
                      href: row.person_id ? `/people/${row.person_id}` : undefined,
                      disabled: !row.person_id,
                    },
                    {
                      label: "Copy frame id",
                      onClick: () => navigator.clipboard.writeText(String(row.frame_id ?? "")),
                      disabled: !row.frame_id,
                    },
                  ]}
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
