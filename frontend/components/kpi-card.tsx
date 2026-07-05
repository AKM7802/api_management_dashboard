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
  icon: Icon,
  tone = "default",
  trend,
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warning" | "critical";
  trend?: number[];
  className?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}
          >
            <Icon className="size-3.5" style={{ color }} />
          </span>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {trend && trend.length > 1 ? (
          <Sparkline data={trend} color={color} height={32} />
        ) : null}
      </CardContent>
    </Card>
  );
}
