"use client";

import {
  useMutation,
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
