import { PageShell } from "@/components/layout/page-shell";
import { DataTable } from "@/components/tables/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ActivityPage() {
  const logs: Array<{ id: string; action: string; actor: string; created_at: string }> = [];
  return (
    <PageShell
      title="Activity"
      description="Global audit and admin activity timeline."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Activity" }]}
    >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          <DataTable
            data={logs}
            searchKeys={["action", "actor"]}
            columns={[
              { key: "action", header: "Action" },
              { key: "actor", header: "Actor" },
              { key: "created_at", header: "Timestamp" },
            ]}
            emptyState={
              <EmptyState
                title="No activity yet"
                description="Audit logs will appear once tenant operations begin."
              />
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
