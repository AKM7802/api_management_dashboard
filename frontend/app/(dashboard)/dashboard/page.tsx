"use client";

import {
  AlertTriangle,
  Binary,
  DollarSign,
  Plus,
  Server,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BarList } from "@/components/charts/bar-list";
import { DonutChart } from "@/components/charts/donut-chart";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
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
import { compactNumber, currency, percent } from "@/lib/format";
import { useAllApiStats, useApis } from "@/lib/queries";
import type { StatsRange } from "@/lib/types";

const METRICS = [
  { key: "requests" as const, label: "Requests", format: (n: number) => n.toLocaleString() },
  { key: "total_tokens" as const, label: "Tokens", format: compactNumber },
  { key: "cost_usd" as const, label: "Cost", format: currency },
  { key: "errors" as const, label: "Errors", format: (n: number) => n.toLocaleString() },
];

const DONUT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export default function DashboardPage() {
  const [range, setRange] = useState<StatsRange>("7d");
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("requests");

  const apis = useApis();
  const { isPending, interval, perApi, mergedSeries, aggregate } = useAllApiStats(
    apis.data,
    range,
  );

  const hasApis = apis.data && apis.data.length > 0;

  const requestsTrend = mergedSeries.map((b) => b.requests);
  const tokensTrend = mergedSeries.map((b) => b.total_tokens);
  const costTrend = mergedSeries.map((b) => b.cost_usd);

  const donutData = [...perApi]
    .sort((a, b) => (b.summary?.requests ?? 0) - (a.summary?.requests ?? 0))
    .reduce<{ key: string; label: string; value: number; color: string }[]>(
      (acc, p, i) => {
        const value = p.summary?.requests ?? 0;
        if (value === 0) return acc;
        if (i < 4) {
          acc.push({ key: p.api.id, label: p.api.name, value, color: DONUT_COLORS[i] });
        } else {
          const other = acc.find((s) => s.key === "other");
          if (other) other.value += value;
          else acc.push({ key: "other", label: "Other", value, color: "var(--muted-foreground)" });
        }
        return acc;
      },
      [],
    );

  const topByTokens = [...perApi]
    .sort((a, b) => (b.summary?.total_tokens ?? 0) - (a.summary?.total_tokens ?? 0))
    .slice(0, 6)
    .filter((p) => (p.summary?.total_tokens ?? 0) > 0)
    .map((p) => ({
      key: p.api.id,
      label: p.api.name,
      value: p.summary?.total_tokens ?? 0,
      formattedValue: compactNumber(p.summary?.total_tokens ?? 0),
    }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Usage across all of your APIs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as StatsRange)}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button render={<Link href="/apis/new" />}>
            <Plus data-icon="inline-start" />
            Add API
          </Button>
        </div>
      </div>

      {!hasApis && !apis.isPending ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Add your first API</EmptyTitle>
            <EmptyDescription>
              Connect an upstream API (OpenAI, Anthropic, or any custom base
              URL), then mint a proxy token to use instead of the real key.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link href="/apis/new" />}>Add API</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {isPending ? (
              [...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
            ) : (
              <>
                <KpiCard
                  label="Requests"
                  value={aggregate.requests.toLocaleString()}
                  icon={Zap}
                  trend={requestsTrend}
                />
                <KpiCard
                  label="Tokens"
                  value={compactNumber(aggregate.total_tokens)}
                  icon={Binary}
                  tone="good"
                  trend={tokensTrend}
                />
                <KpiCard
                  label="Est. cost"
                  value={currency(aggregate.cost_usd)}
                  icon={DollarSign}
                  tone="warning"
                  trend={costTrend}
                />
                <KpiCard
                  label="Error rate"
                  value={percent(aggregate.error_rate)}
                  icon={AlertTriangle}
                  tone={aggregate.error_rate > 0.05 ? "critical" : "default"}
                />
                <KpiCard
                  label="Active APIs"
                  value={`${apis.data?.filter((a) => a.status === "active").length ?? 0} / ${apis.data?.length ?? 0}`}
                  icon={Server}
                />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="font-heading">Usage over time</CardTitle>
                <Tabs value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
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
                {isPending ? (
                  <Skeleton className="h-64 w-full" />
                ) : mergedSeries.length > 0 ? (
                  <TimeSeriesChart
                    data={mergedSeries}
                    interval={interval}
                    integerYAxis={metric !== "cost_usd"}
                    series={[
                      {
                        key: metric,
                        label: METRICS.find((m) => m.key === metric)!.label,
                        color:
                          metric === "errors" ? "var(--chart-5)" : "var(--chart-1)",
                        format: METRICS.find((m) => m.key === metric)!.format,
                      },
                    ]}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No requests yet in this range.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-heading">Requests by API</CardTitle>
              </CardHeader>
              <CardContent>
                {isPending ? (
                  <Skeleton className="h-48 w-full" />
                ) : donutData.length > 0 ? (
                  <DonutChart data={donutData} centerLabel="requests" height={180} />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    No requests yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="font-heading">Top APIs by tokens</CardTitle>
              </CardHeader>
              <CardContent>
                {isPending ? (
                  <Skeleton className="h-40 w-full" />
                ) : topByTokens.length > 0 ? (
                  <BarList items={topByTokens} color="var(--chart-2)" />
                ) : (
                  <p className="text-sm text-muted-foreground">No usage yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-heading">Your APIs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apis.data?.map((a) => {
                      const stats = perApi.find((p) => p.api.id === a.id);
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <Link
                              className="font-medium underline-offset-4 hover:underline"
                              href={`/apis/${a.id}`}
                            >
                              {a.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {a.provider}
                          </TableCell>
                          <TableCell>
                            <Badge variant={a.status === "active" ? "secondary" : "outline"}>
                              {a.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {stats?.summary ? stats.summary.requests.toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
