// Mirrors backend/app/schemas.py

export type Provider = "openai" | "anthropic" | "custom";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface ManagedApi {
  id: string;
  name: string;
  provider: Provider;
  base_url: string;
  secret_last4: string;
  status: "active" | "disabled";
  created_at: string;
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
