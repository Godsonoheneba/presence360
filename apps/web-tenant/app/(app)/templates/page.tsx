"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import type { Template } from "@/lib/types";

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [variables, setVariables] = useState("");
  const [channel, setChannel] = useState("sms");

  const { data: templatesResponse } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<{ items: Template[] }>("/v1/templates"),
  });

  const templates = useMemo(() => templatesResponse?.items ?? [], [templatesResponse?.items]);

  const createTemplate = useMutation({
    mutationFn: async () => {
      const vars = variables
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await api.post("/v1/templates", {
        name,
        channel,
        body,
        variables_json: vars,
        active: true,
      });
    },
    onSuccess: () => {
      toast.success("Template created");
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDialogOpen(false);
      setName("");
      setBody("");
      setVariables("");
    },
    onError: () => toast.error("Unable to create template"),
  });

  return (
    <PermissionGate permissions={["messages.send"]}>
      <PageShell
        title="Templates"
        description="Reusable SMS templates for welcome and absence rules."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Templates" }]}
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            New template
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {templates.length === 0 ? (
            <EmptyState
              title="No templates yet"
              description="Create a welcome or absence template to keep messaging consistent."
            />
          ) : (
            <DataTable
              searchKeys={["name", "body"]}
              columns={[
                { key: "name", header: "Name" },
                { key: "channel", header: "Channel" },
                {
                  key: "active",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value ? "success" : "default"}>
                      {value ? "Active" : "Inactive"}
                    </Badge>
                  ),
                },
                { key: "body", header: "Body" },
              ]}
              data={templates}
              rowActions={(row) => [
                {
                  label: "Copy template name",
                  onClick: () => navigator.clipboard.writeText(row.name ?? ""),
                  disabled: !row.name,
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Template name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              <option value="sms">SMS</option>
            </select>
            <Textarea
              placeholder="Template body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <Input
              placeholder="Variables (comma separated)"
              value={variables}
              onChange={(event) => setVariables(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
