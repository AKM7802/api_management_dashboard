"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { formatBucketLabel } from "@/lib/format";
import type { StatsInterval } from "@/lib/types";

export interface ChartSeries<T> {
  key: keyof T & string;
  label: string;
  color: string;
  type?: "area" | "bar";
  format: (n: number) => string;
}

/**
 * Generic single-axis time-series chart. Pass 1+ series that share the same
 * unit (never mix e.g. counts and milliseconds — that's a dual-axis chart,
 * which this deliberately doesn't support). A legend renders only when there
 * are 2+ series; a single series is named by the card title instead.
 */
export function TimeSeriesChart<T extends { bucket: string }>({
  data,
  interval,
  series,
  height = 256,
  integerYAxis = true,
}: {
  data: T[];
  interval: StatsInterval;
  series: ChartSeries<T>[];
  height?: number;
  /** Set false for fractional units (e.g. cost in dollars) — counts default to whole-number ticks. */
  integerYAxis?: boolean;
}) {
  const rows = data.map((d) => ({
    ...d,
    label: formatBucketLabel(d.bucket, interval),
  }));
  const formatters = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, format: s.format }]),
  );

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="0"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            minTickGap={24}
          />
          <YAxis
            width={64}
            allowDecimals={!integerYAxis}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={series[0].format}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={<ChartTooltip formatters={formatters} />}
          />
          {series.map((s) =>
            s.type === "bar" ? (
              <Bar
                key={s.key}
                dataKey={s.key as string}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            ) : (
              <Area
                key={s.key}
                dataKey={s.key as string}
                name={s.label}
                type="monotone"
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {series.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
