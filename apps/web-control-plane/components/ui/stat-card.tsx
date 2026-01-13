import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  helper?: string;
  className?: string;
};

export function StatCard({ label, value, icon, helper, className }: StatCardProps) {
  return (
    <Card className={cn("bg-card/90", className)}>
      <CardContent className="flex items-center justify-between gap-4 pt-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
          {helper ? <p className="mt-2 text-xs text-muted-foreground">{helper}</p> : null}
        </div>
        {icon ? (
          <div className="rounded-2xl border border-border bg-muted p-3 text-foreground">
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
