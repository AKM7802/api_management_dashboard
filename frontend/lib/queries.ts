"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useActiveTeam } from "@/lib/team-context";
import type {
  Grant,
  Invitation,
  InvitationCreated,
  InvitationPreview,
  InviteRole,
  ManagedApi,
  Member,
  MemberUsageRow,
  ProxyToken,
  ProxyTokenCreated,
  Role,
  StatsBucket,
  StatsInterval,
  StatsRange,
  StatsSummary,
  Team,
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

// --- teams ----------------------------------------------------------------

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });
}

/** The caller's role in the currently active team, or null in Personal mode
 * (or if teams haven't loaded yet). Drives all RBAC gating in the UI. */
export function useActiveMembership(): { role: Role | null; team: Team | null } {
  const { activeTeamId } = useActiveTeam();
  const teams = useTeams();
  if (!activeTeamId || !teams.data) return { role: null, team: null };
  const team = teams.data.find((t) => t.id === activeTeamId) ?? null;
  return { role: team?.my_role ?? null, team };
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<Team>("/teams", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useRenameTeam(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api<Team>(`/teams/${teamId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) =>
      api<void>(`/teams/${teamId}`, { method: "DELETE" }),
    onSuccess: async (_data, teamId) => {
      // exact: true so this only refetches the plain list, not every
      // ["teams", teamId, ...] sub-resource query too -- those would all
      // 404 for a team that no longer exists (invalidateQueries matches by
      // key prefix by default) and the resulting refetch storm was
      // observed to stall the redirect away from the now-deleted team's page
      await qc.cancelQueries({ queryKey: ["teams", teamId] });
      qc.removeQueries({ queryKey: ["teams", teamId] });
      qc.invalidateQueries({ queryKey: ["teams"], exact: true });
    },
  });
}

export function useTransferOwnership(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user_id: string }) =>
      api<void>(`/teams/${teamId}/transfer`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["teams", teamId, "members"] });
    },
  });
}

// --- members ----------------------------------------------------------------

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: ["teams", teamId, "members"],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
    enabled: !!teamId,
  });
}

export function useUpdateMemberRole(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api<Member>(`/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["teams", teamId, "members"] }),
  });
}

export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams", teamId, "members"] });
      qc.invalidateQueries({ queryKey: ["apis"] });
    },
  });
}

// --- invitations --------------------------------------------------------------

export function useInvitations(teamId: string) {
  return useQuery({
    queryKey: ["teams", teamId, "invitations"],
    queryFn: () => api<Invitation[]>(`/teams/${teamId}/invitations`),
    enabled: !!teamId,
  });
}

export function useCreateInvitation(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: InviteRole }) =>
      api<InvitationCreated>(`/teams/${teamId}/invitations`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["teams", teamId, "invitations"] }),
  });
}

export function useRevokeInvitation(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api<void>(`/teams/${teamId}/invitations/${invitationId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["teams", teamId, "invitations"] }),
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ["invitations", token],
    queryFn: () => api<InvitationPreview>(`/invitations/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<void>("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

// --- managed APIs (team-context-aware) ---------------------------------------

export function useApis() {
  const { activeTeamId } = useActiveTeam();
  return useQuery({
    queryKey: ["apis", activeTeamId],
    queryFn: () => api<ManagedApi[]>("/apis"),
  });
}

export function useApi(id: string) {
  const { activeTeamId } = useActiveTeam();
  return useQuery({
    queryKey: ["apis", id, activeTeamId],
    queryFn: () => api<ManagedApi>(`/apis/${id}`),
  });
}

export function useCreateApi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; base_url: string; secret: string }) =>
      api<ManagedApi>("/apis", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apis"] }),
  });
}

// APIs the caller personally owns and hasn't already put in a team --
// candidates to attach to the currently active team, regardless of which
// context is active (always reads Personal, bypassing X-Team-Id).
export function usePersonalApisForAttach(enabled: boolean) {
  return useQuery({
    queryKey: ["apis", "personal-for-attach"],
    queryFn: () => api<ManagedApi[]>("/apis", {}, { forcePersonal: true }),
    enabled,
  });
}

export function useAttachApiToTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ apiId, teamId }: { apiId: string; teamId: string }) =>
      api<ManagedApi>(`/apis/${apiId}/attach-team`, {
        method: "POST",
        body: JSON.stringify({ team_id: teamId }),
      }),
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

// --- per-person access grants (team APIs only) -------------------------------

export function useGrants(apiId: string) {
  return useQuery({
    queryKey: ["apis", apiId, "grants"],
    queryFn: () => api<Grant[]>(`/apis/${apiId}/grants`),
    enabled: !!apiId,
  });
}

export function useGrantAccess(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<Grant>(`/apis/${apiId}/grants`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apis", apiId, "grants"] }),
  });
}

export function useRevokeGrant(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/apis/${apiId}/grants/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apis", apiId, "grants"] }),
  });
}

// --- proxy tokens -----------------------------------------------------------

export function useTokens(apiId: string) {
  const { activeTeamId } = useActiveTeam();
  return useQuery({
    queryKey: ["apis", apiId, "tokens", activeTeamId],
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

export function useStats(
  apiId: string,
  range: StatsRange,
  interval: StatsInterval,
  memberId?: string,
) {
  const { activeTeamId } = useActiveTeam();
  const qs = memberId ? `&member_id=${memberId}` : "";
  return useQuery({
    queryKey: ["apis", apiId, "stats", range, interval, activeTeamId, memberId],
    queryFn: () =>
      api<StatsBucket[]>(
        `/apis/${apiId}/stats?range=${range}&interval=${interval}${qs}`,
      ),
  });
}

export function useStatsSummary(apiId: string, range: StatsRange, memberId?: string) {
  const { activeTeamId } = useActiveTeam();
  const qs = memberId ? `&member_id=${memberId}` : "";
  return useQuery({
    queryKey: ["apis", apiId, "summary", range, activeTeamId, memberId],
    queryFn: () =>
      api<StatsSummary>(`/apis/${apiId}/stats/summary?range=${range}${qs}`),
  });
}

export function useLogs(apiId: string, limit = 25, memberId?: string) {
  const { activeTeamId } = useActiveTeam();
  const qs = memberId ? `&member_id=${memberId}` : "";
  return useQuery({
    queryKey: ["apis", apiId, "logs", limit, activeTeamId, memberId],
    queryFn: () => api<UsageLogRow[]>(`/apis/${apiId}/logs?limit=${limit}${qs}`),
  });
}

// --- per-member usage monitoring (admin/owner only) --------------------------

export function useApiUsageByMember(
  apiId: string,
  range: StatsRange,
  enabled = true,
) {
  return useQuery({
    queryKey: ["apis", apiId, "usage-by-member", range],
    queryFn: () =>
      api<MemberUsageRow[]>(`/apis/${apiId}/usage/by-member?range=${range}`),
    enabled: !!apiId && enabled,
  });
}

export function useTeamUsageSummary(teamId: string, range: StatsRange) {
  return useQuery({
    queryKey: ["teams", teamId, "usage-summary", range],
    queryFn: () =>
      api<StatsSummary>(`/teams/${teamId}/usage/summary?range=${range}`),
    enabled: !!teamId,
  });
}

export function useTeamUsageByMember(teamId: string, range: StatsRange) {
  return useQuery({
    queryKey: ["teams", teamId, "usage-by-member", range],
    queryFn: () =>
      api<MemberUsageRow[]>(`/teams/${teamId}/usage/by-member?range=${range}`),
    enabled: !!teamId,
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
  const { activeTeamId } = useActiveTeam();
  const interval: StatsInterval = range === "24h" ? "hour" : "day";
  const ids = apis?.map((a) => a.id) ?? [];

  const summaryQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["apis", id, "summary", range, activeTeamId, undefined],
      queryFn: () => api<StatsSummary>(`/apis/${id}/stats/summary?range=${range}`),
    })),
  });
  const seriesQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["apis", id, "stats", range, interval, activeTeamId, undefined],
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
