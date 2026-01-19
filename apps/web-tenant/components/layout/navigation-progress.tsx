"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const timer = setTimeout(() => setActive(false), 600);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-50 h-0.5 w-full">
      <div
        className={cn(
          "h-full origin-left bg-primary transition-all duration-500",
          active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
    </div>
  );
}
