"use client";

import { AlertTriangle, Binary, DollarSign, KeyRound, Shield, Zap } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { AccessPanel } from "@/components/access-panel";
import { KpiCard } from "@/components/kpi-card";
import { TokensPanel } from "@/components/tokens-panel";
import { UsagePanel } from "@/components/usage-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { compactNumber, currency, percent } from "@/lib/format";
import {
  useActiveMembership,
  useApi,
  useDeleteApi,
  useStats,
  useStatsSummary,
  useUpdateApi,
} from "@/lib/queries";

export default function ApiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi(id);
  const update = useUpdateApi(id);
  const del = useDeleteApi();
  const summary = useStatsSummary(id, "30d");
  const series = useStats(id, "30d", "day");
  const { role } = useActiveMembership();

  if (api.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!api.data) return null;
  const a = api.data;

  // personal API (team_id null) → the caller is always its sole owner, full
  // control, as today. Team API → only owner/admin can configure or grant.
  const isTeamApi = a.team_id !== null;
  const isAdmin = !isTeamApi || role === "owner" || role === "admin";

  function toggleStatus() {
    const next = a.status === "active" ? "disabled" : "active";
    update.mutate(
      { status: next },
      { onSuccess: () => toast.success(`API ${next}`) },
    );
  }

  function onDelete() {
    if (!confirm(`Delete "${a.name}" and all its tokens? This cannot be undone.`))
      return;
    del.mutate(a.id, {
      onSuccess: () => {
        toast.success("API deleted");
        router.push("/dashboard");
      },
    });
  }

  const trend = (key: "requests" | "total_tokens" | "cost_usd") =>
    series.data?.map((b) => b[key]) ?? [];

  // "custom" providers are unknown-shaped APIs; only surface LLM-token/cost
  // metrics once we've actually seen a provider that reports them, or a
  // known LLM provider (openai/anthropic always report usage).
  const isLikelyLlm =
    a.provider !== "custom" || (summary.data?.total_tokens ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {a.name}
          </h1>
          <Badge variant={a.status === "active" ? "secondary" : "outline"}>
            {a.status}
          </Badge>
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleStatus}>
              {a.status === "active" ? "Disable" : "Enable"}
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tokens">
            <KeyRound data-icon="inline-start" />
            Access Tokens
          </TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          {isTeamApi && isAdmin ? (
            <TabsTrigger value="access">
              <Shield data-icon="inline-start" />
              Access
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
          {summary.data ? (
            <div
              className={`grid grid-cols-2 gap-3 ${isLikelyLlm ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
            >
              <KpiCard
                label="Requests (30d)"
                value={summary.data.requests.toLocaleString()}
                icon={Zap}
                trend={trend("requests")}
              />
              {isLikelyLlm ? (
                <>
                  <KpiCard
                    label="LLM Tokens (30d)"
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
                label="Error rate"
                value={percent(summary.data.error_rate)}
                icon={AlertTriangle}
                tone={summary.data.error_rate > 0.05 ? "critical" : "default"}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Details</CardTitle>
              <CardDescription>Upstream configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Provider</dt>
                <dd>{a.provider}</dd>
                <dt className="text-muted-foreground">Base URL</dt>
                <dd className="font-mono">{a.base_url}</dd>
                <dt className="text-muted-foreground">Key</dt>
                <dd className="font-mono">••••{a.secret_last4}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(a.created_at).toLocaleDateString()}</dd>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="pt-4">
          <TokensPanel apiId={a.id} />
        </TabsContent>

        <TabsContent value="usage" className="pt-4">
          <UsagePanel
            apiId={a.id}
            provider={a.provider}
            teamId={a.team_id}
            isAdmin={isAdmin}
          />
        </TabsContent>

        {isTeamApi && isAdmin ? (
          <TabsContent value="access" className="pt-4">
            <AccessPanel apiId={a.id} teamId={a.team_id!} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
