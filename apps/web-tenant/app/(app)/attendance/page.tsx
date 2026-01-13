"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import { getActiveSessionId, setActiveSessionId } from "@/lib/active-session";
import { generateId } from "@/lib/id";
import { loadLocalItems, mergeById, upsertLocalItem } from "@/lib/local-store";
import type { Service, ServiceSession } from "@/lib/types";

export default function AttendancePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");

  const { data: sessionsResponse } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<{ items: ServiceSession[] }>("/v1/sessions"),
  });
  const { data: servicesResponse } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ items: Service[] }>("/v1/services"),
  });

  const sessions = useMemo(
    () =>
      mergeById<ServiceSession>(
        sessionsResponse?.items ?? [],
        loadLocalItems<ServiceSession>("sessions"),
      ),
    [sessionsResponse?.items],
  );
  const services = useMemo(
    () =>
      mergeById<Service>(
        servicesResponse?.items ?? [],
        loadLocalItems<Service>("services"),
      ),
    [servicesResponse?.items],
  );

  const startSession = useMutation({
    mutationFn: async () => {
      const id = generateId();
      const payload = { id, service_id: serviceId || services[0]?.id || null };
      await api.post("/v1/sessions", payload);
      await api.post(`/v1/sessions/${id}/start`, {});
      upsertLocalItem<ServiceSession>("sessions", {
        id,
        service_id: payload.service_id,
        status: "live",
      });
      setActiveSessionId(id);
      return id;
    },
    onSuccess: (id) => {
      toast.success("Session started");
      setDialogOpen(false);
      setServiceId("");
      if (id) {
        void api.get("/healthz", { skipAuth: true });
      }
    },
    onError: () => toast.error("Unable to start session"),
  });

  return (
    <PermissionGate permissions={["attendance.read"]}>
      <PageShell
        title="Attendance"
        description="Active sessions and attendance rollups by service."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Attendance" }]}
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/live-attendance">Live view</Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <PlusCircle className="h-4 w-4" />
              Start session
            </Button>
          </div>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-6">
          {sessions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              description="Start a service session to view attendance rollups."
              action={
                <Button asChild>
                  <Link href="/onboarding">Run setup wizard</Link>
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={[
                { key: "id", header: "Session" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "live" ? "success" : "default"}>
                      {String(value ?? "scheduled")}
                    </Badge>
                  ),
                },
                {
                  key: "id",
                  header: "",
                  render: (value) => (
                    <Link
                      href={`/sessions/${value}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View
                    </Link>
                  ),
                },
              ]}
              data={sessions}
            />
          )}
          {sessions.length > 0 ? (
            <div className="mt-4 text-xs text-muted-foreground">
              Active session: {getActiveSessionId() ?? "None"}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Service
            </label>
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name ?? service.id}
                </option>
              ))}
            </select>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </label>
              <Input placeholder="Optional notes" className="mt-2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => startSession.mutate()}
              disabled={startSession.isPending || (services.length === 0 && !serviceId)}
            >
              Start now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
