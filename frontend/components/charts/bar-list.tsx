// Ranked bar list — a common "top N" dashboard idiom (top APIs, top models).
// Plain HTML/CSS rather than Recharts: the bar itself is the label's own row,
// which reads better than a chart axis for a short ranked list.

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
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.formattedValue ?? item.value.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (item.value / max) * 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
