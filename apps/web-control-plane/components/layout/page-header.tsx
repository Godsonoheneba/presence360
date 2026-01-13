import type { ReactNode } from "react";

import { Breadcrumbs, type Breadcrumb } from "@/components/layout/breadcrumbs";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}
