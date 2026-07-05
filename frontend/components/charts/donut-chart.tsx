"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload: DonutSlice }>;
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0].payload;
  const share = total > 0 ? slice.value / total : 0;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: slice.color }}
        />
        <span className="text-muted-foreground">{slice.label}</span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          {slice.value.toLocaleString()}
        </span>
      </div>
      <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground">
        {(share * 100).toFixed(1)}%
      </p>
    </div>
  );
}

/** Donut chart with a centered total and a legend (always present — 2+ series). */
export function DonutChart({
  data,
  height = 220,
  centerLabel,
}: {
  data: DonutSlice[];
  height?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">
            {total.toLocaleString()}
          </span>
          {centerLabel ? (
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          ) : null}
        </div>
      </div>
      <ul className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-40">
        {data.map((d) => {
          const share = total > 0 ? d.value / total : 0;
          return (
            <li key={d.key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="truncate text-muted-foreground">{d.label}</span>
              <span className="ml-auto shrink-0 tabular-nums text-foreground">
                {(share * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
