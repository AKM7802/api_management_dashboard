import type { LucideIcon } from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_COLOR: Record<string, string> = {
  default: "var(--primary)",
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
};

export function KpiCard({
  label,
  value,
  tone = "default",
  trend,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warning" | "critical";
  trend?: number[];
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <Card className={cn("gap-0 py-3.5", className)}>
      <CardContent className="flex flex-col gap-1.5 px-4">
        <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {trend && trend.length > 1 ? (
          <Sparkline data={trend} color={color} height={28} className="mt-1" />
        ) : null}
      </CardContent>
    </Card>
  );
}
