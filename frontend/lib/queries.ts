"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ManagedApi,
  ProxyToken,
  ProxyTokenCreated,
  StatsBucket,
  StatsInterval,
  StatsRange,
  StatsSummary,
  User,
  UsageLogRow,
} from "@/lib/types";

// --- auth ---------------------------------------------------------------

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });
}

// --- managed APIs ---------------------------------------------------------

export function useApis() {
  return useQuery({
    queryKey: ["apis"],
    queryFn: () => api<ManagedApi[]>("/apis"),
  });
}

export function useApi(id: string) {
  return useQuery({
    queryKey: ["apis", id],
    queryFn: () => api<ManagedApi>(`/apis/${id}`),
  });
}

export function useCreateApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      provider: string;
      base_url: string;
      secret: string;
    }) => api<ManagedApi>("/apis", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apis"] }),
  });
}

export function useUpdateApi(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; status?: string; secret?: string }) =>
      api<ManagedApi>(`/apis/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apis"] }),
  });
}

export function useDeleteApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/apis/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apis"] }),
  });
}

// --- proxy tokens -----------------------------------------------------------

export function useTokens(apiId: string) {
  return useQuery({
    queryKey: ["apis", apiId, "tokens"],
    queryFn: () => api<ProxyToken[]>(`/apis/${apiId}/tokens`),
  });
}

export function useCreateToken(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<ProxyTokenCreated>(`/apis/${apiId}/tokens`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["apis", apiId, "tokens"] }),
  });
}

export function useRevokeToken(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      api<void>(`/tokens/${tokenId}`, { method: "DELETE" }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["apis", apiId, "tokens"] }),
  });
}

// --- stats -------------------------------------------------------------------

export function useStats(apiId: string, range: StatsRange, interval: StatsInterval) {
  return useQuery({
    queryKey: ["apis", apiId, "stats", range, interval],
    queryFn: () =>
      api<StatsBucket[]>(`/apis/${apiId}/stats?range=${range}&interval=${interval}`),
  });
}

export function useStatsSummary(apiId: string, range: StatsRange) {
  return useQuery({
    queryKey: ["apis", apiId, "summary", range],
    queryFn: () =>
      api<StatsSummary>(`/apis/${apiId}/stats/summary?range=${range}`),
  });
}

export function useLogs(apiId: string, limit = 25) {
  return useQuery({
    queryKey: ["apis", apiId, "logs", limit],
    queryFn: () => api<UsageLogRow[]>(`/apis/${apiId}/logs?limit=${limit}`),
  });
}

// --- aggregate stats across all of a user's APIs (dashboard overview) --------

export interface MergedBucket {
  bucket: string;
  requests: number;
  total_tokens: number;
  errors: number;
  cost_usd: number;
}

export interface PerApiStats {
  api: ManagedApi;
  summary?: StatsSummary;
  series: StatsBucket[];
}

/**
 * Fans out per-API summary + timeseries queries (small N, fine for v1) and
 * combines them client-side: no new backend endpoint needed. Buckets align
 * because every API's timestamps are truncated by the same backend clock.
 */
export function useAllApiStats(apis: ManagedApi[] | undefined, range: StatsRange) {
  const interval: StatsInterval = range === "24h" ? "hour" : "day";
  const ids = apis?.map((a) => a.id) ?? [];

  const summaryQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["apis", id, "summary", range],
      queryFn: () => api<StatsSummary>(`/apis/${id}/stats/summary?range=${range}`),
    })),
  });
  const seriesQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["apis", id, "stats", range, interval],
      queryFn: () =>
        api<StatsBucket[]>(`/apis/${id}/stats?range=${range}&interval=${interval}`),
    })),
  });

  const isPending =
    apis === undefined ||
    summaryQueries.some((q) => q.isPending) ||
    seriesQueries.some((q) => q.isPending);

  const perApi: PerApiStats[] = (apis ?? []).map((a, i) => ({
    api: a,
    summary: summaryQueries[i]?.data,
    series: seriesQueries[i]?.data ?? [],
  }));

  const totals = perApi.reduce(
    (acc, p) => {
      if (!p.summary) return acc;
      acc.requests += p.summary.requests;
      acc.total_tokens += p.summary.total_tokens;
      acc.cost_usd += p.summary.cost_usd;
      acc.errorWeighted += p.summary.error_rate * p.summary.requests;
      acc.latencyWeighted += p.summary.avg_latency_ms * p.summary.requests;
      return acc;
    },
    { requests: 0, total_tokens: 0, cost_usd: 0, errorWeighted: 0, latencyWeighted: 0 },
  );

  const bucketMap = new Map<string, MergedBucket>();
  for (const p of perApi) {
    for (const b of p.series) {
      const row = bucketMap.get(b.bucket) ?? {
        bucket: b.bucket,
        requests: 0,
        total_tokens: 0,
        errors: 0,
        cost_usd: 0,
      };
      row.requests += b.requests;
      row.total_tokens += b.total_tokens;
      row.errors += b.errors;
      row.cost_usd += b.cost_usd;
      bucketMap.set(b.bucket, row);
    }
  }
  const mergedSeries = Array.from(bucketMap.values()).sort((a, b) =>
    a.bucket.localeCompare(b.bucket),
  );

  return {
    isPending,
    interval,
    perApi,
    mergedSeries,
    aggregate: {
      requests: totals.requests,
      total_tokens: totals.total_tokens,
      cost_usd: totals.cost_usd,
      error_rate: totals.requests ? totals.errorWeighted / totals.requests : 0,
      avg_latency_ms: totals.requests ? totals.latencyWeighted / totals.requests : 0,
    },
  };
}
