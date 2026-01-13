import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground">
            {icon}
          </span>
        ) : null}
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
