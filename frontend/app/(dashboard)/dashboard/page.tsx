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
import { useActiveMembership, useAllApiStats, useApis } from "@/lib/queries";
import type { StatsRange } from "@/lib/types";

const ALL_METRICS = [
  { key: "requests" as const, label: "Requests", format: (n: number) => n.toLocaleString(), llmOnly: false },
  { key: "total_tokens" as const, label: "LLM Tokens", format: compactNumber, llmOnly: true },
  { key: "cost_usd" as const, label: "Cost", format: currency, llmOnly: true },
  { key: "errors" as const, label: "Errors", format: (n: number) => n.toLocaleString(), llmOnly: false },
];

const DONUT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export default function DashboardPage() {
  const [range, setRange] = useState<StatsRange>("7d");
  const [metric, setMetric] = useState<(typeof ALL_METRICS)[number]["key"]>("requests");

  const apis = useApis();
  const { role } = useActiveMembership();
  // in Personal mode role is null (owner-equivalent); in Team mode only
  // owner/admin may add APIs — a member's dashboard is read-only
  const canManageApis = role === null || role === "owner" || role === "admin";
  const { isPending, interval, perApi, mergedSeries, aggregate } = useAllApiStats(
    apis.data,
    range,
  );

  const hasApis = apis.data && apis.data.length > 0;
  // "custom" providers are unknown-shaped APIs; only surface LLM-token/cost
  // metrics once we know at least one API is a known LLM provider, or one
  // has actually reported token usage.
  const hasTokenData =
    apis.data?.some((a) => a.provider !== "custom") || aggregate.total_tokens > 0;

  const METRICS = ALL_METRICS.filter((m) => hasTokenData || !m.llmOnly);
  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

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

  // rank by tokens when we have LLM data, otherwise fall back to requests —
  // keeps this card useful for accounts with only non-LLM APIs
  const topApis = [...perApi]
    .sort((a, b) => {
      const key = hasTokenData ? "total_tokens" : "requests";
      return (b.summary?.[key] ?? 0) - (a.summary?.[key] ?? 0);
    })
    .slice(0, 6)
    .filter((p) => (hasTokenData ? p.summary?.total_tokens : p.summary?.requests))
    .map((p) => {
      const value = hasTokenData
        ? (p.summary?.total_tokens ?? 0)
        : (p.summary?.requests ?? 0);
      return {
        key: p.api.id,
        label: p.api.name,
        value,
        formattedValue: hasTokenData ? compactNumber(value) : value.toLocaleString(),
      };
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            {role === "member"
              ? "Usage for the APIs you've been granted."
              : "Usage across all of your APIs."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as StatsRange)}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
          {canManageApis ? (
            <Button render={<Link href="/apis/new" />}>
              <Plus data-icon="inline-start" />
              Add API
            </Button>
          ) : null}
        </div>
      </div>

      {!hasApis && !apis.isPending ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {canManageApis ? "Add your first API" : "No APIs granted yet"}
            </EmptyTitle>
            <EmptyDescription>
              {canManageApis
                ? "Connect an upstream API (OpenAI, Anthropic, or any custom base URL), then mint an access token to use instead of the real key."
                : "Ask a team owner or admin to grant you access to an API."}
            </EmptyDescription>
          </EmptyHeader>
          {canManageApis ? (
            <EmptyContent>
              <Button render={<Link href="/apis/new" />}>Add API</Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${hasTokenData ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}
          >
            {isPending ? (
              [...Array(hasTokenData ? 5 : 3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))
            ) : (
              <>
                <KpiCard
                  label="Requests"
                  value={aggregate.requests.toLocaleString()}
                  icon={Zap}
                  trend={requestsTrend}
                />
                {hasTokenData ? (
                  <>
                    <KpiCard
                      label="LLM Tokens"
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
                  </>
                ) : null}
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

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle className="font-heading">
                {role === "member" ? "Your granted APIs" : "Your APIs"}
              </CardTitle>
              {canManageApis ? (
                <Button variant="outline" size="sm" render={<Link href="/apis/new" />}>
                  <Plus data-icon="inline-start" />
                  Add API
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    {hasTokenData ? (
                      <TableHead className="text-right">LLM Tokens</TableHead>
                    ) : null}
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
                        {hasTokenData ? (
                          <TableCell className="text-right tabular-nums">
                            {stats?.summary
                              ? compactNumber(stats.summary.total_tokens)
                              : "—"}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <CardTitle className="font-heading">Usage over time</CardTitle>
                <Tabs value={activeMetric.key} onValueChange={(v) => setMetric(v as typeof metric)}>
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
                    integerYAxis={activeMetric.key !== "cost_usd"}
                    series={[
                      {
                        key: activeMetric.key,
                        label: activeMetric.label,
                        color:
                          activeMetric.key === "errors" ? "var(--chart-5)" : "var(--chart-1)",
                        format: activeMetric.format,
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

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading">Requests by API</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending ? (
                    <Skeleton className="h-40 w-full" />
                  ) : donutData.length > 0 ? (
                    <DonutChart data={donutData} centerLabel="requests" height={150} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No requests yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading">
                    Top APIs by {hasTokenData ? "tokens" : "requests"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending ? (
                    <Skeleton className="h-40 w-full" />
                  ) : topApis.length > 0 ? (
                    <BarList
                      items={topApis}
                      color={hasTokenData ? "var(--chart-2)" : "var(--chart-1)"}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No usage yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
