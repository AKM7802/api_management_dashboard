"use client";

import { AlertTriangle, Binary, DollarSign, Server, Zap } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BackLink } from "@/components/back-link";
import { BarList } from "@/components/charts/bar-list";
import { DonutChart } from "@/components/charts/donut-chart";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { compactNumber, currency, percent } from "@/lib/format";
import {
  useAllApiStats,
  useMemberApiAccess,
  useTeamMembers,
  useTeams,
} from "@/lib/queries";
import type { StatsRange } from "@/lib/types";

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

export default function MemberDetailPage() {
  const { teamId, userId } = useParams<{ teamId: string; userId: string }>();
  const [range, setRange] = useState<StatsRange>("7d");
  // scoped to the team in the URL, not whatever team is currently active in
  // the switcher elsewhere in the app -- those can differ if this link is
  // opened while a different team is selected
  const teams = useTeams();
  const myRole = teams.data?.find((t) => t.id === teamId)?.my_role;
  const isAdmin = myRole === "owner" || myRole === "admin";

  const members = useTeamMembers(teamId);
  const access = useMemberApiAccess(teamId, userId, range, isAdmin);

  const member = members.data?.find((m) => m.user_id === userId);
  const grantedRows = (access.data ?? []).filter((r) => r.granted);
  const grantedApis = grantedRows.map((r) => ({ id: r.api_id, name: r.name }));

  const { isPending, interval, perApi, mergedSeries, aggregate } =
    useAllApiStats(grantedApis, range, userId);

  const hasTokenData = aggregate.total_tokens > 0;

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
          else
            acc.push({
              key: "other",
              label: "Other",
              value,
              color: "var(--muted-foreground)",
            });
        }
        return acc;
      },
      [],
    );

  const topApis = [...perApi]
    .sort((a, b) => (hasTokenData ? (b.summary?.total_tokens ?? 0) - (a.summary?.total_tokens ?? 0) : (b.summary?.requests ?? 0) - (a.summary?.requests ?? 0)))
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

  if (members.isPending || (teams.data && !isAdmin ? false : access.isPending)) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard" label="Back to dashboard" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (teams.data && !isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard" label="Back to dashboard" />
        <Card>
          <CardHeader>
            <CardTitle>Only owners and admins can view this page</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" label="Back to dashboard" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {member?.email ?? "Member"}
          </h1>
          {member ? (
            <Badge variant={member.role === "owner" ? "accent" : "outline"}>
              {member.role}
            </Badge>
          ) : null}
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as StatsRange)}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div
        className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${hasTokenData ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}
      >
        {isPending ? (
          [...Array(hasTokenData ? 5 : 3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))
        ) : (
          <>
            <KpiCard label="Requests" value={aggregate.requests.toLocaleString()} icon={Zap} />
            {hasTokenData ? (
              <>
                <KpiCard
                  label="Tokens"
                  value={compactNumber(aggregate.total_tokens)}
                  icon={Binary}
                  tone="good"
                />
                <KpiCard
                  label="Est. cost"
                  value={currency(aggregate.cost_usd)}
                  icon={DollarSign}
                  tone="warning"
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
              label="APIs granted"
              value={`${grantedApis.length} / ${access.data?.length ?? 0}`}
              icon={Server}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading">Usage over time</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : mergedSeries.length > 0 ? (
              <TimeSeriesChart
                data={mergedSeries}
                interval={interval}
                series={[
                  { key: "requests", label: "Requests", color: "var(--chart-1)", format: (n) => n.toLocaleString() },
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
                <BarList items={topApis} color={hasTokenData ? "var(--chart-2)" : "var(--chart-1)"} />
              ) : (
                <p className="text-sm text-muted-foreground">No usage yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Granted APIs</CardTitle>
        </CardHeader>
        <CardContent>
          {grantedRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  {hasTokenData ? (
                    <TableHead className="text-right">Tokens</TableHead>
                  ) : null}
                  {hasTokenData ? (
                    <TableHead className="text-right">Cost</TableHead>
                  ) : null}
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantedRows.map((row) => (
                  <TableRow key={row.api_id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="accent">
                        {row.implicit ? "Always" : "Granted"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.requests.toLocaleString()}
                    </TableCell>
                    {hasTokenData ? (
                      <TableCell className="text-right tabular-nums">
                        {compactNumber(row.total_tokens)}
                      </TableCell>
                    ) : null}
                    {hasTokenData ? (
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
            <p className="text-sm text-muted-foreground">
              No APIs granted yet. Grant access from an API&apos;s own Access
              tab.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
