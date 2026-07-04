"use client";

import { useState } from "react";

import { StatCard } from "@/components/stat-card";
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
import { UsageChart } from "@/components/usage-chart";
import { useLogs, useStats, useStatsSummary } from "@/lib/queries";
import type { StatsInterval, StatsRange } from "@/lib/types";

const METRICS = [
  { key: "requests", label: "Requests" },
  { key: "total_tokens", label: "Tokens" },
  { key: "avg_latency_ms", label: "Latency" },
  { key: "errors", label: "Errors" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function UsagePanel({ apiId }: { apiId: string }) {
  const [range, setRange] = useState<StatsRange>("7d");
  const [metric, setMetric] = useState<MetricKey>("requests");
  const interval: StatsInterval = range === "24h" ? "hour" : "day";

  const stats = useStats(apiId, range, interval);
  const summary = useStatsSummary(apiId, range);
  const logs = useLogs(apiId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
          <TabsList>
            {METRICS.map((m) => (
              <TabsTrigger key={m.key} value={m.key}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={range} onValueChange={(v) => setRange(v as StatsRange)}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {summary.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Requests"
            value={summary.data.requests.toLocaleString()}
          />
          <StatCard
            label="Tokens"
            value={summary.data.total_tokens.toLocaleString()}
          />
          <StatCard
            label="Error rate"
            value={`${(summary.data.error_rate * 100).toFixed(1)}%`}
          />
          <StatCard
            label="Avg latency"
            value={`${Math.round(summary.data.avg_latency_ms)} ms`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {stats.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : stats.data && stats.data.length > 0 ? (
        <UsageChart data={stats.data} interval={interval} metric={metric} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No requests yet</EmptyTitle>
            <EmptyDescription>
              Send a request through your proxy token and it will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {logs.data && logs.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Recent requests</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.data.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(r.ts + "Z").toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-xs">
                    {r.path}
                  </TableCell>
                  <TableCell>{r.model || "—"}</TableCell>
                  <TableCell
                    className={
                      r.status_code >= 400 ? "text-destructive" : undefined
                    }
                  >
                    {r.status_code}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.total_tokens.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.latency_ms} ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
