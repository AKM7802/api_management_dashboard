"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

/** Minimal inline trend chart for stat cards. No axes, no tooltip, no legend. */
export function Sparkline({
  data,
  color = "var(--chart-1)",
  height = 40,
  className,
}: {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) return null;
  const rows = data.map((value, i) => ({ i, value }));

  return (
    <div style={{ height }} className={`w-full ${className ?? ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            dataKey="value"
            type="monotone"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#sparkline-fill)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
