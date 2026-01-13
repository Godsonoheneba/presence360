import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ActivityPage() {
  return (
    <PageShell
      title="Activity"
      description="Global audit and admin activity timeline."
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Activity" }]}
    >
      <Card className="bg-card/90">
        <CardContent className="pt-5">
          <EmptyState
            title="No activity yet"
            description="Audit logs will appear once tenant operations begin."
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
