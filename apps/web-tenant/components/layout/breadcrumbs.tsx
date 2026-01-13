import Link from "next/link";

import { cn } from "@/lib/utils";

export type Breadcrumb = {
  label: string;
  href?: string;
};

export function Breadcrumbs({
  items,
  className,
}: {
  items: Breadcrumb[];
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground", className)}>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
          {index < items.length - 1 ? <span>/</span> : null}
        </span>
      ))}
    </nav>
  );
}
