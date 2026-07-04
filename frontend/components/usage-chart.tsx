"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StatsBucket, StatsInterval } from "@/lib/types";

function formatBucket(iso: string, interval: StatsInterval) {
  const d = new Date(iso);
  return interval === "hour"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function UsageChart({
  data,
  interval,
  metric,
}: {
  data: StatsBucket[];
  interval: StatsInterval;
  metric: "requests" | "total_tokens" | "avg_latency_ms" | "errors";
}) {
  const rows = data.map((b) => ({
    ...b,
    label: formatBucket(b.bucket, interval),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            width={44}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#usage-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
