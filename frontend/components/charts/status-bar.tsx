// Stacked status-code bar: a single rounded track split into colored segments
// by share of total, with an inline legend below — matches the wireframe's
// "Status codes" panel more closely than a donut (which reads as "by API",
// not "by outcome").

export interface StatusBarSegment {
  key: string;
  label: string;
  color: string;
  value: number;
}

export function StatusBar({ data }: { data: StatusBarSegment[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {data.map((d) => {
          const share = total > 0 ? d.value / total : 0;
          if (share === 0) return null;
          return (
            <div
              key={d.key}
              style={{ width: `${share * 100}%`, backgroundColor: d.color }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-xs">
        {data.map((d) => {
          const share = total > 0 ? d.value / total : 0;
          return (
            <span
              key={d.key}
              className="flex items-center gap-1.5"
              style={{ color: d.color }}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: d.color }}
              />
              {d.label} {(share * 100).toFixed(0)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
