import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

type Breadcrumb = {
  label: string;
  href?: string;
};

type PageShellProps = {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function PageShell({
  title,
  description,
  breadcrumbs,
  action,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        action={action}
      />
      {children}
    </div>
  );
}
