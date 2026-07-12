// Mirrors backend/app/schemas.py

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface ManagedApi {
  id: string;
  name: string;
  // null when the caller is a granted team member, not an admin/owner — the
  // upstream address/key are admin-only; a member only ever calls the
  // gateway's own proxy URL.
  base_url: string | null;
  secret_last4: string | null;
  status: "active" | "disabled";
  created_at: string;
  team_id: string | null; // null = personal API
}

export interface ProxyToken {
  id: string;
  name: string;
  token_prefix: string;
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
}

export interface ProxyTokenCreated extends ProxyToken {
  token: string; // shown exactly once
}

export interface ManagedApiCreated extends ManagedApi {
  // a token minted for the creator in the same request, shown exactly once
  token: ProxyTokenCreated;
}

export interface StatsBucket {
  bucket: string;
  requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  errors: number;
  cost_usd: number;
}

export interface StatsSummary {
  requests: number;
  total_tokens: number;
  error_rate: number;
  avg_latency_ms: number;
  cost_usd: number;
}

export interface UsageLogRow {
  ts: string;
  path: string;
  model: string;
  status_code: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_usd: number;
}

export type StatsRange = "24h" | "7d" | "30d";
export type StatsInterval = "hour" | "day";

// --- teams / RBAC (opt-in; absent = Personal mode) -------------------------

export type Role = "owner" | "admin" | "member";
export type InviteRole = "admin" | "member";

export interface Team {
  id: string;
  name: string;
  created_at: string;
  my_role: Role;
}

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface InvitationCreated extends Invitation {
  token: string; // shown exactly once
}

export interface InvitationPreview {
  team_id: string;
  team_name: string;
  role: string;
  email: string;
}

export interface Grant {
  user_id: string;
  email: string;
  granted_at: string;
}

export interface MemberUsageRow {
  user_id: string;
  email: string;
  requests: number;
  total_tokens: number;
  cost_usd: number;
  errors: number;
}

export interface MemberStatsBucket {
  user_id: string;
  email: string;
  bucket: string;
  requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  errors: number;
  cost_usd: number;
}

export interface MemberApiAccessRow {
  api_id: string;
  name: string;
  granted: boolean;
  implicit: boolean; // true for owner/admin — access can't be toggled off
  requests: number;
  total_tokens: number;
  cost_usd: number;
  errors: number;
}
