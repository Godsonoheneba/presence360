"use client";

import { useMemo, useState } from "react";
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
import { generateId } from "@/lib/id";
import { setActiveSessionId } from "@/lib/active-session";
import { loadLocalItems, mergeById, upsertLocalItem } from "@/lib/local-store";
import type { Service, ServiceSession } from "@/lib/types";

export default function ServicesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");

  const { data: servicesResponse } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ items: Service[] }>("/v1/services"),
  });

  const services = useMemo(
    () =>
      mergeById<Service>(
        servicesResponse?.items ?? [],
        loadLocalItems<Service>("services"),
      ),
    [servicesResponse?.items],
  );

  const createService = useMutation({
    mutationFn: async () => {
      const payload = { id: generateId(), name: serviceName || "Sunday Service" };
      await api.post("/v1/services", payload);
      upsertLocalItem<Service>("services", payload);
      return payload;
    },
    onSuccess: () => {
      toast.success("Service created");
      setDialogOpen(false);
      setServiceName("");
    },
    onError: () => toast.error("Unable to create service"),
  });

  const startNow = useMutation({
    mutationFn: async (serviceId: string) => {
      const sessionId = generateId();
      await api.post("/v1/sessions", { id: sessionId, service_id: serviceId });
      await api.post(`/v1/sessions/${sessionId}/start`, {});
      upsertLocalItem<ServiceSession>("sessions", {
        id: sessionId,
        service_id: serviceId,
        status: "live",
      });
      setActiveSessionId(sessionId);
      return sessionId;
    },
    onSuccess: () => toast.success("Session started"),
    onError: () => toast.error("Unable to start session"),
  });

  return (
    <PermissionGate permissions={["services.manage"]}>
      <PageShell
        title="Services"
        description="Define recurring services and launch sessions instantly."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Services" }]}
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            New service
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {services.length === 0 ? (
            <EmptyState
              title="No services yet"
              description="Create your first service to start tracking attendance."
              action={<Button onClick={() => setDialogOpen(true)}>Create service</Button>}
            />
          ) : (
            <DataTable
              searchKeys={["name", "id"]}
              columns={[
                { key: "name", header: "Service" },
                {
                  key: "id",
                  header: "Status",
                  render: () => <Badge variant="default">Ready</Badge>,
                },
              ]}
              data={services}
              rowActions={(row) => [
                {
                  label: "Start session",
                  onClick: () => startNow.mutate(String(row.id)),
                },
                {
                  label: "Copy service id",
                  onClick: () => navigator.clipboard.writeText(String(row.id)),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create service</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Service name"
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createService.mutate()}
              disabled={createService.isPending || !serviceName}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
