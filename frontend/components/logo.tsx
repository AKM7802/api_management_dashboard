import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-block size-[19px] shrink-0 rounded-[6px] bg-primary" />
      <span className="font-heading text-sm font-bold tracking-tight whitespace-nowrap sm:text-base">
        API Manager
      </span>
    </span>
  );
}
