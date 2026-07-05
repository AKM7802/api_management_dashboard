"use client";

import { AlertTriangle, Binary, Clock, DollarSign, Zap } from "lucide-react";
import { useState } from "react";

import { BarList } from "@/components/charts/bar-list";
import { DonutChart } from "@/components/charts/donut-chart";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactNumber, currency, milliseconds, percent } from "@/lib/format";
import {
  useApiUsageByMember,
  useLogs,
  useStats,
  useStatsSummary,
} from "@/lib/queries";
import type { StatsInterval, StatsRange, UsageLogRow } from "@/lib/types";

const ALL_METRICS = [
  { key: "requests", label: "Requests", color: "var(--chart-1)", format: (n: number) => n.toLocaleString(), llmOnly: false },
  { key: "total_tokens", label: "LLM Tokens", color: "var(--chart-2)", format: compactNumber, llmOnly: true },
  { key: "cost_usd", label: "Cost", color: "var(--chart-3)", format: currency, llmOnly: true },
  { key: "avg_latency_ms", label: "Latency", color: "var(--chart-4)", format: milliseconds, llmOnly: false },
  { key: "errors", label: "Errors", color: "var(--chart-5)", format: (n: number) => n.toLocaleString(), llmOnly: false },
] as const;

type MetricKey = (typeof ALL_METRICS)[number]["key"];

const STATUS_BUCKETS = [
  { key: "2xx", label: "2xx success", color: "var(--status-good)" },
  { key: "3xx", label: "3xx redirect", color: "var(--status-warning)" },
  { key: "4xx", label: "4xx client error", color: "var(--status-serious)" },
  { key: "5xx", label: "5xx server error", color: "var(--status-critical)" },
];

function statusMix(logs: UsageLogRow[]) {
  const counts = new Map<string, number>();
  for (const row of logs) {
    const bucket = `${Math.floor(row.status_code / 100)}xx`;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return STATUS_BUCKETS.filter((b) => (counts.get(b.key) ?? 0) > 0).map((b) => ({
    ...b,
    value: counts.get(b.key) ?? 0,
  }));
}

function modelBreakdown(logs: UsageLogRow[]) {
  const counts = new Map<string, number>();
  for (const row of logs) {
    const model = row.model || "unknown";
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([model, count]) => ({ key: model, label: model, value: count }));
}

export function UsagePanel({
  apiId,
  teamId,
  isAdmin,
}: {
  apiId: string;
  teamId?: string | null;
  isAdmin?: boolean;
}) {
  const [range, setRange] = useState<StatsRange>("7d");
  const [metric, setMetric] = useState<MetricKey>("requests");
  const interval: StatsInterval = range === "24h" ? "hour" : "day";
  const showByMember = !!teamId && !!isAdmin;
  const byMember = useApiUsageByMember(apiId, range, showByMember);

  const stats = useStats(apiId, range, interval);
  const summary = useStatsSummary(apiId, range);
  const logs = useLogs(apiId, 50);
  // fixed 30d window, independent of the visible range, so LLM-metric
  // visibility doesn't flicker as the user switches the range toggle
  const capability = useStatsSummary(apiId, "30d");

  // registering an API never declares whether it's an LLM — purely observed
  // from whether any response has actually reported token usage
  const isLikelyLlm = (capability.data?.total_tokens ?? 0) > 0;
  const METRICS = ALL_METRICS.filter((m) => isLikelyLlm || !m.llmOnly);
  // falls back gracefully if the active metric isn't in the filtered list
  // (e.g. capability resolves to non-LLM after an LLM-only tab was selected)
  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const trend = (key: MetricKey) => stats.data?.map((b) => b[key] as number) ?? [];
  const statuses = logs.data ? statusMix(logs.data) : [];
  const models = logs.data ? modelBreakdown(logs.data) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Usage for this API</p>
        <Tabs value={range} onValueChange={(v) => setRange(v as StatsRange)}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {summary.data ? (
        <div
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${isLikelyLlm ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}
        >
          <KpiCard
            label="Requests"
            value={summary.data.requests.toLocaleString()}
            icon={Zap}
            trend={trend("requests")}
          />
          {isLikelyLlm ? (
            <>
              <KpiCard
                label="LLM Tokens"
                value={compactNumber(summary.data.total_tokens)}
                icon={Binary}
                tone="good"
                trend={trend("total_tokens")}
              />
              <KpiCard
                label="Est. cost"
                value={currency(summary.data.cost_usd)}
                icon={DollarSign}
                tone="warning"
                trend={trend("cost_usd")}
              />
            </>
          ) : null}
          <KpiCard
            label="Avg latency"
            value={milliseconds(summary.data.avg_latency_ms)}
            icon={Clock}
            trend={trend("avg_latency_ms")}
          />
          <KpiCard
            label="Error rate"
            value={percent(summary.data.error_rate)}
            icon={AlertTriangle}
            tone={summary.data.error_rate > 0.05 ? "critical" : "default"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="font-heading">Usage over time</CardTitle>
            <Tabs value={activeMetric.key} onValueChange={(v) => setMetric(v as MetricKey)}>
              <TabsList>
                {METRICS.map((m) => (
                  <TabsTrigger key={m.key} value={m.key}>
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {stats.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : stats.data && stats.data.length > 0 ? (
              <TimeSeriesChart
                data={stats.data}
                interval={interval}
                integerYAxis={activeMetric.key !== "cost_usd"}
                series={[
                  {
                    key: activeMetric.key,
                    label: activeMetric.label,
                    color: activeMetric.color,
                    format: activeMetric.format,
                  },
                ]}
              />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No requests yet</EmptyTitle>
                  <EmptyDescription>
                    Send a request through your proxy token and it will show
                    up here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Status mix</CardTitle>
            <p className="text-xs text-muted-foreground">Last {logs.data?.length ?? 0} requests</p>
          </CardHeader>
          <CardContent>
            {logs.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : statuses.length > 0 ? (
              <DonutChart data={statuses} height={160} />
            ) : (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`grid gap-4 ${isLikelyLlm ? "lg:grid-cols-3" : ""}`}>
        {isLikelyLlm ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Models used</CardTitle>
              <p className="text-xs text-muted-foreground">Last {logs.data?.length ?? 0} requests</p>
            </CardHeader>
            <CardContent>
              {logs.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : models.length > 0 ? (
                <BarList items={models} color="var(--chart-4)" />
              ) : (
                <p className="text-sm text-muted-foreground">No requests yet.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card className={isLikelyLlm ? "lg:col-span-2" : ""}>
          <CardHeader>
            <CardTitle className="font-heading">Recent requests</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.data && logs.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    {isLikelyLlm ? (
                      <TableHead className="text-right">LLM Tokens</TableHead>
                    ) : null}
                    <TableHead className="text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.data.slice(0, 10).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.ts + "Z").toLocaleString()}
                      </TableCell>
                      <TableCell>{r.model || "—"}</TableCell>
                      <TableCell
                        className={
                          r.status_code >= 400 ? "text-destructive" : undefined
                        }
                      >
                        {r.status_code}
                      </TableCell>
                      {isLikelyLlm ? (
                        <TableCell className="text-right tabular-nums">
                          {r.total_tokens.toLocaleString()}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums">
                        {r.latency_ms} ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {showByMember ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Usage by member</CardTitle>
            <p className="text-xs text-muted-foreground">
              Owners and admins see everyone; members only ever see their own.
            </p>
          </CardHeader>
          <CardContent>
            {byMember.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : byMember.data && byMember.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    {isLikelyLlm ? (
                      <TableHead className="text-right">Tokens</TableHead>
                    ) : null}
                    {isLikelyLlm ? (
                      <TableHead className="text-right">Cost</TableHead>
                    ) : null}
                    <TableHead className="text-right">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMember.data.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>{row.email}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.requests.toLocaleString()}
                      </TableCell>
                      {isLikelyLlm ? (
                        <TableCell className="text-right tabular-nums">
                          {compactNumber(row.total_tokens)}
                        </TableCell>
                      ) : null}
                      {isLikelyLlm ? (
                        <TableCell className="text-right tabular-nums">
                          {currency(row.cost_usd)}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right tabular-nums">
                        {row.errors.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No usage yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
