"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { StatCard } from "@/components/stat-card";
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
import {
  useApi,
  useDeleteApi,
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{a.name}</h1>
          <Badge variant={a.status === "active" ? "secondary" : "outline"}>
            {a.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={toggleStatus}>
            {a.status === "active" ? "Disable" : "Enable"}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
          {summary.data ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Requests (30d)"
                value={summary.data.requests.toLocaleString()}
              />
              <StatCard
                label="Tokens (30d)"
                value={summary.data.total_tokens.toLocaleString()}
              />
              <StatCard
                label="Error rate"
                value={`${(summary.data.error_rate * 100).toFixed(1)}%`}
              />
              <StatCard
                label="Est. cost"
                value={`$${summary.data.cost_usd.toFixed(4)}`}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
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
          <UsagePanel apiId={a.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
