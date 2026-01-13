"use client";

import { useState } from "react";
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
import { PermissionGate } from "@/components/auth/permission-gate";
import { api } from "@/lib/api";
import type { Rule } from "@/lib/types";
import { RoleGate } from "@/components/auth/role-gate";

export default function RulesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleType, setRuleType] = useState("welcome");

  const { data: rulesResponse, isLoading } = useQuery({
    queryKey: ["rules"],
    queryFn: () => api.get<{ items: Rule[] }>("/v1/rules"),
  });

  const rules = rulesResponse?.items ?? [];

  const createRule = useMutation({
    mutationFn: async () => {
      await api.post("/v1/rules", {
        name: ruleName || `${ruleType} rule`,
        rule_type: ruleType,
        status: "active",
      });
    },
    onSuccess: () => {
      toast.success("Rule created");
      void queryClient.invalidateQueries({ queryKey: ["rules"] });
      setDialogOpen(false);
      setRuleName("");
    },
    onError: () => toast.error("Unable to create rule"),
  });

  const runRule = useMutation({
    mutationFn: async (ruleId: string) => api.post(`/v1/rules/${ruleId}/run`, {}),
    onSuccess: () => toast.success("Rule run queued"),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Rule run failed"),
  });

  return (
    <PermissionGate permissions={["rules.read"]}>
      <PageShell
        title="Rules"
        description="Automated welcome and absence workflows."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Rules" }]}
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            New rule
          </Button>
        }
      >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              title="No rules configured"
              description="Create welcome and absence rules to automate messaging."
            />
          ) : (
            <DataTable
              columns={[
                { key: "name", header: "Rule" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => (
                    <Badge variant={value === "active" ? "success" : "default"}>
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
                { key: "rule_type", header: "Type" },
                {
                  key: "id",
                  header: "",
                  render: (value) => (
                    <RoleGate permissions={["rules.run"]}>
                      <button
                        className="text-xs font-semibold text-primary hover:underline"
                        onClick={() => runRule.mutate(String(value))}
                      >
                        Run now
                      </button>
                    </RoleGate>
                  ),
                },
              ]}
              data={rules}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Rule name"
              value={ruleName}
              onChange={(event) => setRuleName(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={ruleType}
              onChange={(event) => setRuleType(event.target.value)}
            >
              <option value="welcome">Welcome</option>
              <option value="absence">Absence</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createRule.mutate()} disabled={createRule.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PermissionGate>
  );
}
