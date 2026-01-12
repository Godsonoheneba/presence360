"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Person } from "@/lib/types";

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get<{ items: Person[] }>("/v1/people");
        setPeople(response.items ?? []);
      } catch {
        setPeople([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description="Members and visitors with consent status and face enrollment."
      />
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people found yet.</p>
          ) : (
            <DataTable
              columns={[
                { key: "full_name", header: "Name" },
                {
                  key: "consent_status",
                  header: "Consent",
                  render: (value) => (
                    <Badge
                      variant={
                        value === "consented"
                          ? "success"
                          : value === "revoked"
                            ? "danger"
                            : "default"
                      }
                    >
                      {String(value ?? "unknown")}
                    </Badge>
                  ),
                },
                { key: "id", header: "Person ID" },
              ]}
              data={people}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
