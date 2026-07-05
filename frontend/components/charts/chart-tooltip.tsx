"use client";

// Shared tooltip for time-series charts: one readout listing every series at
// the hovered X, value leads (strong), series name follows (secondary), keyed
// by a short stroke of the series color — not a filled swatch box.

export interface TooltipSeriesEntry {
  key: string;
  label: string;
  color: string;
  value: number;
  format: (n: number) => string;
}

export function ChartTooltip({
  active,
  label,
  payload,
  formatters,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>;
  formatters: Record<string, { label: string; format: (n: number) => string }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {label ? (
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      ) : null}
      <dl className="flex flex-col gap-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? "");
          const meta = formatters[key];
          if (!meta || entry.value === undefined) return null;
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <dt className="text-muted-foreground">{meta.label}</dt>
              <dd className="ml-auto font-semibold tabular-nums text-foreground">
                {meta.format(entry.value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
