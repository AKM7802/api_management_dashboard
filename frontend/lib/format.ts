// Shared number formatting for stat cards, charts, and tables.

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: n >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function currency(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

export function percent(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function milliseconds(n: number): string {
  return `${Math.round(n)} ms`;
}

export function formatBucketLabel(iso: string, interval: "hour" | "day"): string {
  const d = new Date(iso);
  return interval === "hour"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}
