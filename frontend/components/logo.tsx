import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Zap className="size-4" fill="currentColor" strokeWidth={0} />
      </span>
      <span className="font-heading text-base font-semibold tracking-tight">
        API Manager
      </span>
    </span>
  );
}
