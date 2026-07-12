// Ranked bar list — a common "top N" dashboard idiom (top APIs, top models).
// Plain HTML/CSS rather than Recharts. Single-row layout (label | inline
// track | value) rather than a stacked label-then-bar layout — reads closer
// to a compact ranked table than a chart.

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  formattedValue?: string;
}

export function BarList({
  items,
  color = "var(--chart-1)",
}: {
  items: BarListItem[];
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-2.5 text-[12.5px]"
        >
          <span className="w-28 shrink-0 truncate text-foreground">
            {item.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (item.value / max) * 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
            {item.formattedValue ?? item.value.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
