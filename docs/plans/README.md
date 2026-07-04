# API Management Platform — Simple v1 Plans

> Source spec: [`API_Gateway_Platform_Specification.pdf`](../../API_Gateway_Platform_Specification.pdf) — **deliberately simplified** for a first version.

## What v1 does (and nothing more)

1. A user signs up and **adds an API** they want to manage (an upstream provider key — OpenAI, Anthropic, or any custom base URL).
2. The platform gives them a **proxy token** (`xpxy_live_...`) to use instead of the real key.
3. Clients call our **proxy endpoint** with that token; we inject the real key and forward the request (streaming supported).
4. Every request is **logged**, and the **dashboard shows usage statistics per individual API** (requests, tokens, latency, errors over time).

That's it. No billing, no anomaly detection, no multi-region, no message brokers.

## Architecture (3 pieces, all free & open-source)

```
                ┌─────────────────────────────────────────────┐
   Browser ───► │  Next.js frontend  (landing + dashboard)     │
                └───────────────┬─────────────────────────────┘
                                │ REST (JSON)
                ┌───────────────▼─────────────────────────────┐
   API client   │        FastAPI backend  (Python)            │
   (xpxy_live_) │  • auth (signup/login, JWT)                 │
     ─────────► │  • manage APIs & proxy tokens               │
                │  • reverse proxy  (/proxy/*) + SSE stream    │
                │  • usage logging  (asyncio queue → flush)    │
                └───────┬───────────────────────┬─────────────┘
                        │                        │
              ┌─────────▼────────┐     ┌─────────▼──────────┐
              │  PostgreSQL      │     │  DuckDB (file)     │
              │  TRANSACTIONAL   │     │  ANALYTICAL        │
              │  users, apis,    │     │  usage_logs +      │
              │  proxy_tokens    │     │  dashboard queries │
              └──────────────────┘     └────────────────────┘
```

- **Backend:** Python + **FastAPI** (async, native streaming/SSE via `StreamingResponse` + `httpx`).
- **Transactional DB:** **PostgreSQL** — accounts, managed APIs, proxy tokens.
- **Analytical DB:** **DuckDB** — an embedded file DB for usage logs + fast dashboard aggregations. Zero servers, zero ops.
- **Frontend:** **Next.js** (one app: SEO landing page + the authenticated dashboard with charts).
- **Secrets:** upstream API keys encrypted with the **`cryptography`** library (AES-GCM), key from an env var. No Vault.
- **Everything else** the original spec had (Redis, Kafka, ClickHouse, Vault, Go, Stripe) is **removed.**

## The plans

| # | Plan | Covers |
|---|------|--------|
| 1 | [Backend (FastAPI)](./01-backend-fastapi.md) | Auth, data models, the reverse proxy, usage logging, dashboard stats API |
| 2 | [Frontend Dashboard](./02-frontend-dashboard.md) | Next.js dashboard: add API, view proxy tokens, per-API usage charts |
| 3 | [Landing Page + Onboarding](./03-landing-onboarding.md) | SEO landing page + simple signup/first-API onboarding |

## How the two databases split

| Concern | Store | Why |
|---------|-------|-----|
| Accounts, managed APIs, proxy tokens, encrypted secrets | **PostgreSQL** | Needs transactions, updates, unique constraints, relations |
| Usage logs (one row per proxied request) + all dashboard aggregations | **DuckDB** | Append-mostly, read-heavy analytical queries (group-by-time); columnar & fast; embedded = no ops |

**Write path (why no Kafka):** the proxy pushes each finished request onto an in-process `asyncio.Queue`; a single background task batch-inserts into DuckDB every ~1s or ~100 rows. This keeps logging off the request's critical path without any broker.

**Concurrency note (honest trade-off):** DuckDB is single-writer. Run the backend as **one process** for v1 (a single background task owns all DuckDB writes; reads for the dashboard share the same connection). This is fine for a first version. If you later need multiple backend workers, swap DuckDB for **TimescaleDB** (a Postgres extension) with the same `usage_logs` schema — no other code changes.

## Tech stack (all MIT/Apache/BSD, nothing paid)

FastAPI · Uvicorn · SQLAlchemy 2.0 + Alembic · psycopg · DuckDB · httpx · pydantic · passlib[bcrypt] · python-jose (JWT) · cryptography · Next.js · React · Tailwind · shadcn/ui · Recharts · Docker Compose.

## Run it (dev)

One `docker-compose.yml` with three services: `postgres`, `backend` (FastAPI), `frontend` (Next.js). DuckDB is just a file mounted into the backend container. No other infrastructure.

## Build order

1. **Backend** — models + auth + proxy + usage logging + stats endpoints (plan 1).
2. **Frontend dashboard** — against the backend API (plan 2).
3. **Landing + onboarding** — same Next.js app (plan 3).

A good first milestone: add an API → get a proxy token → make one proxied request via `curl` → see it appear as a row in the dashboard's usage chart. That single loop exercises the whole system.
