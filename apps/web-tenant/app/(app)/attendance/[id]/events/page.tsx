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
import { formatDateTime, formatSessionLabel } from "@/lib/format";
import type { Gate, Location, Person, Service, ServiceSession, VisitEvent } from "@/lib/types";

export default function VisitEventsPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");

  const { data: eventsResponse, isLoading } = useQuery({
    queryKey: ["visit-events"],
    queryFn: () => api.get<{ items: VisitEvent[] }>("/v1/visit-events"),
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

  const events = eventsResponse?.items ?? [];
  const sessions = sessionsResponse?.items ?? [];
  const services = servicesResponse?.items ?? [];
  const locations = locationsResponse?.items ?? [];
  const gates = gatesResponse?.items ?? [];
  const people = peopleResponse?.items ?? [];
  const gateMap = Object.fromEntries(gates.map((gate) => [gate.id, gate]));
  const peopleMap = Object.fromEntries(people.map((person) => [person.id, person]));
  const serviceMap = Object.fromEntries(services.map((service) => [service.id, service]));
  const locationMap = Object.fromEntries(locations.map((location) => [location.id, location]));
  const currentSession = sessions.find((session) => session.id === sessionId);
  const sessionLabel = currentSession
    ? formatSessionLabel(currentSession, serviceMap, locationMap)
    : sessionId;
  const sessionLocationName = currentSession?.service_id
    ? locationMap[serviceMap[currentSession.service_id]?.location_id ?? ""]?.name
    : undefined;
  const eventRows = events.map((event) => ({
    ...event,
    decision: event.person_id ? "matched" : "unknown",
    location_name: sessionLocationName ?? "—",
  }));

  return (
    <PermissionGate permissions={["reports.read"]}>
      <PageShell
        title="Visit events"
        description="Raw event stream for this session."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Attendance", href: "/attendance" },
          { label: sessionLabel, href: `/attendance/${sessionId}` },
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
              searchKeys={["person_id", "gate_id", "decision"]}
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
                {
                  key: "decision",
                  header: "Decision",
                  render: (value) => (
                    <Badge variant={value === "matched" ? "success" : "default"}>
                      {String(value)}
                    </Badge>
                  ),
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
      </PageShell>
    </PermissionGate>
  );
}
