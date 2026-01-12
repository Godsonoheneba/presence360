"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Rule } from "@/lib/types";

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<{ items: Rule[] }>("/v1/rules");
        setRules(response.items ?? []);
      } catch {
        setRules([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Rules" description="Automated welcome and absence workflows." />
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules configured yet.</p>
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
                { key: "id", header: "Rule ID" },
              ]}
              data={rules}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
