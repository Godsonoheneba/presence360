import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

export function ForbiddenState() {
  return (
    <EmptyState
      title="Access restricted"
      description="You do not have permission to view this area. Request access from your admin."
      icon={<ShieldAlert className="h-5 w-5" />}
    />
  );
}
