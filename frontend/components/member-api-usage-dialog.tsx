"use client";

import { AlertTriangle, Binary, Clock, DollarSign, Zap } from "lucide-react";
import { useState } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { KpiCard } from "@/components/kpi-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useLogs, useStats, useStatsSummary } from "@/lib/queries";
import type { StatsInterval, StatsRange } from "@/lib/types";

/** Drill-down for one teammate's usage of one specific API — reached from
 * that API's own "Usage by member" table. Distinct from the cross-API member
 * detail page: this stays scoped to a single credential. */
export function MemberApiUsageDialog({
  apiId,
  member,
  isLikelyLlm,
  open,
  onOpenChange,
}: {
  apiId: string;
  member: { user_id: string; email: string } | null;
  isLikelyLlm: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [range, setRange] = useState<StatsRange>("7d");
  const interval: StatsInterval = range === "24h" ? "hour" : "day";
  const memberId = member?.user_id;

  const summary = useStatsSummary(apiId, range, memberId);
  const stats = useStats(apiId, range, interval, memberId);
  const logs = useLogs(apiId, 20, memberId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member?.email}</DialogTitle>
          <DialogDescription>Their usage of this API specifically.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
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
              className={`grid grid-cols-2 gap-3 ${isLikelyLlm ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
            >
              <KpiCard label="Requests" value={summary.data.requests.toLocaleString()} icon={Zap} />
              {isLikelyLlm ? (
                <>
                  <KpiCard
                    label="Tokens"
                    value={compactNumber(summary.data.total_tokens)}
                    icon={Binary}
                    tone="good"
                  />
                  <KpiCard
                    label="Est. cost"
                    value={currency(summary.data.cost_usd)}
                    icon={DollarSign}
                    tone="warning"
                  />
                </>
              ) : (
                <KpiCard
                  label="Avg latency"
                  value={milliseconds(summary.data.avg_latency_ms)}
                  icon={Clock}
                />
              )}
              <KpiCard
                label="Error rate"
                value={percent(summary.data.error_rate)}
                icon={AlertTriangle}
                tone={summary.data.error_rate > 0.05 ? "critical" : "default"}
              />
            </div>
          ) : (
            <div className={`grid grid-cols-2 gap-3 ${isLikelyLlm ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              {[...Array(isLikelyLlm ? 4 : 3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          )}

          {stats.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : stats.data && stats.data.length > 0 ? (
            <TimeSeriesChart
              data={stats.data}
              interval={interval}
              height={200}
              series={[
                {
                  key: "requests",
                  label: "Requests",
                  color: "var(--chart-1)",
                  format: (n) => n.toLocaleString(),
                },
              ]}
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No requests yet in this range.
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Recent requests</p>
            {logs.data && logs.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Endpoint</TableHead>
                    {isLikelyLlm ? <TableHead>Model</TableHead> : null}
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.data.slice(0, 10).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(r.ts + "Z").toLocaleString()}
                      </TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs">
                        {r.path}
                      </TableCell>
                      {isLikelyLlm ? <TableCell>{r.model || "—"}</TableCell> : null}
                      <TableCell className={r.status_code >= 400 ? "text-destructive" : undefined}>
                        {r.status_code}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.latency_ms} ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
