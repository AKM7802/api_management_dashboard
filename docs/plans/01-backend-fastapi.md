# Plan 1 — Backend (FastAPI)

One Python service that does everything: auth, managing APIs & proxy tokens, the reverse proxy, usage logging, and the dashboard stats API. All open-source, all free.

## Stack

- **FastAPI** + **Uvicorn** — async web framework, native streaming.
- **SQLAlchemy 2.0** + **Alembic** — ORM + migrations for PostgreSQL.
- **psycopg** — Postgres driver.
- **DuckDB** — embedded analytical DB (usage logs + dashboard queries).
- **httpx** — async HTTP client for forwarding to upstream providers (supports streaming).
- **passlib[bcrypt]** + **python-jose** — password hashing + JWT.
- **cryptography** — encrypt upstream API keys at rest.
- **pydantic** — request/response schemas.

## Project layout

```
backend/
  app/
    main.py                 # FastAPI app, startup/shutdown, background flush task
    config.py               # env settings (DB url, secret keys, encryption key)
    db/
      postgres.py           # SQLAlchemy engine/session
      duckdb.py             # DuckDB connection + schema init + write queue
    models.py               # SQLAlchemy models (users, api_credentials, proxy_tokens)
    schemas.py              # pydantic schemas
    security.py             # password hashing, JWT, secret encryption (Fernet/AES-GCM)
    auth.py                 # signup/login routes + get_current_user dependency
    apis.py                 # CRUD for managed APIs (credentials)
    tokens.py               # create/list/revoke proxy tokens
    proxy.py                # the reverse proxy endpoint + streaming
    usage.py                # usage queue, background flush, stats queries
    pricing.py              # optional static model→price map for cost estimate
  alembic/                  # migrations
  requirements.txt
  Dockerfile
```

## Data model

### PostgreSQL (transactional)

```
users
  id            uuid  pk
  email         text  unique
  password_hash text
  created_at    timestamptz

api_credentials              -- "an API the user manages"
  id                uuid  pk
  user_id           uuid  fk -> users
  name              text          -- e.g. "My OpenAI key"
  provider          text          -- openai | anthropic | custom
  base_url          text          -- e.g. https://api.openai.com
  encrypted_secret  bytea         -- the real key, AES-GCM encrypted
  secret_last4      text          -- for display
  status            text          -- active | disabled
  created_at        timestamptz

proxy_tokens
  id            uuid  pk
  credential_id uuid  fk -> api_credentials
  name          text
  token_hash    text  unique      -- sha256(raw token)
  token_prefix  text              -- "xpxy_live_ab12" for display
  status        text              -- active | revoked
  created_at    timestamptz
  last_used_at  timestamptz null
```

### DuckDB (analytical)

```
usage_logs
  ts                timestamp
  proxy_token_id    varchar
  credential_id     varchar
  user_id           varchar
  status_code       integer
  path              varchar
  model             varchar
  prompt_tokens     integer
  completion_tokens integer
  total_tokens      integer
  latency_ms        integer
  cost_usd          double        -- optional, computed from pricing.py
```

Created on startup with a single `CREATE TABLE IF NOT EXISTS`. No migrations tool needed for DuckDB in v1.

## Security / secret handling

- Upstream keys are **encrypted before insert** using `cryptography` (Fernet, or AES-256-GCM) with a key from the `ENCRYPTION_KEY` env var. Postgres stores only ciphertext + `secret_last4`.
- Decryption happens **in memory only**, inside the proxy request, right before forwarding. Never logged, never returned to the client.
- Proxy tokens: generate `xpxy_live_<32 random bytes, base62>`; store only `sha256(token)`; **show the raw token once** on creation.
- Passwords: bcrypt via passlib. Dashboard auth: JWT (short-lived) in an httpOnly cookie or `Authorization` header.

## API surface

**Auth**
- `POST /auth/signup` `{email, password}` → creates user, returns JWT
- `POST /auth/login` `{email, password}` → JWT
- `GET  /auth/me` → current user

**Managed APIs** (auth required, scoped to the user)
- `GET    /apis` → list
- `POST   /apis` `{name, provider, base_url, secret}` → encrypts secret, stores
- `GET    /apis/{id}`
- `PATCH  /apis/{id}` `{name?, status?}` (rotate secret via this too)
- `DELETE /apis/{id}`

**Proxy tokens**
- `GET    /apis/{id}/tokens` → list tokens for an API
- `POST   /apis/{id}/tokens` `{name}` → returns raw `xpxy_live_...` **once**
- `DELETE /tokens/{id}` → revoke

**Usage / stats** (powers the dashboard)
- `GET /apis/{id}/stats?range=7d&interval=day`
  → time-series: requests, total_tokens, avg_latency, error_count, cost per bucket
- `GET /apis/{id}/stats/summary?range=30d`
  → KPI totals: total requests, total tokens, error rate, avg latency, total cost
- `GET /apis/{id}/logs?limit=50&cursor=` → recent raw request rows

**The proxy** (no dashboard JWT — authenticated by the proxy token)
- `POST /proxy/{path:path}` (and `GET`, etc.) with `Authorization: Bearer xpxy_live_...`

**Health**
- `GET /health`

## Reverse proxy flow (`proxy.py`)

1. Read `Authorization: Bearer xpxy_live_...`; compute `sha256`.
2. Look up `proxy_tokens` by hash in Postgres (with a small **in-memory TTL cache**, e.g. a dict with 30s expiry, so repeat calls skip the DB). Reject if missing/revoked → `401`.
3. Load the linked `api_credentials`; **decrypt** the secret in memory.
4. Build the upstream request with `httpx`: `base_url + path`, copy the client body, replace the `Authorization` header with the real key (provider-appropriate: OpenAI `Bearer`, Anthropic `x-api-key`).
5. **Stream** the upstream response back to the client with FastAPI `StreamingResponse` over `httpx.AsyncClient.stream(...)` — SSE passes straight through, chunk by chunk, no buffering.
6. While streaming, capture status, latency, and token counts (parse the final usage chunk for OpenAI/Anthropic; fall back to a rough estimate or zero if absent).
7. On completion, push a `UsageEvent` onto the in-process `asyncio.Queue`. **The client connection is already done** — logging never blocks it.

Failure handling (keep simple): upstream error → forward its status; upstream unreachable/timeout → `502`/`504`; decrypt fails → `500` (logged, no secret leaked). No retries in v1.

## Usage logging (`usage.py`) — no Kafka, no Redis

- One global `asyncio.Queue`. The proxy `put_nowait`s events onto it.
- A **single background task** (started in `main.py` on `startup`) drains the queue in batches (every ~1s or ~100 events) and does one DuckDB `INSERT ... ` (executemany / Appender). This task is the **only DuckDB writer**.
- The stats endpoints read from the **same DuckDB connection** (DuckDB supports concurrent read within the process).
- On shutdown, flush the queue before exit so nothing is lost.

Dashboard queries are plain DuckDB SQL, e.g.:
```sql
SELECT time_bucket, count(*) AS requests, sum(total_tokens) AS tokens,
       avg(latency_ms) AS avg_latency, sum(cost_usd) AS cost,
       sum(status_code >= 400) AS errors
FROM usage_logs
WHERE credential_id = ? AND ts >= ?
GROUP BY time_bucket ORDER BY time_bucket;
```
(Use `date_trunc('day'|'hour', ts)` for the bucket.)

## Cost (optional, `pricing.py`)

A hardcoded dict `{("openai","gpt-4o"): (in_price, out_price), ...}` → compute `cost_usd` at log time. If a model isn't in the map, store `cost_usd = 0`. Purely for a nicer chart; skippable in v1.

## Testing

- **Unit:** secret encrypt/decrypt round-trip, token hashing, stats SQL (against a temp DuckDB), pricing math.
- **Integration:** spin up Postgres + a **mock upstream** (a tiny FastAPI app returning a fake SSE stream); assert full loop — create API → create token → call `/proxy/...` → a `usage_logs` row appears → `/apis/{id}/stats` reflects it.
- **Auth:** signup/login/JWT, and that user A can't see user B's APIs.
- Tooling: `pytest`, `httpx.AsyncClient` test client.

## Deployment

- **Dockerfile** (python:3.12-slim), `uvicorn app.main:app` **single worker** (required for the DuckDB single-writer model in v1).
- Env vars: `DATABASE_URL`, `DUCKDB_PATH` (a mounted volume file), `JWT_SECRET`, `ENCRYPTION_KEY`.
- Runs in the shared `docker-compose.yml` alongside Postgres and the frontend.
- Alembic `upgrade head` runs on container start (for Postgres). DuckDB self-initializes.

## Phases

1. **Skeleton + auth.** FastAPI app, config, Postgres models, Alembic, signup/login/JWT, `/auth/me`. *Done when:* a user can register and log in.
2. **Manage APIs + tokens.** Encrypted-secret CRUD for `api_credentials`; create/list/revoke proxy tokens (raw shown once). *Done when:* a user can add an API and mint a token.
3. **Reverse proxy + usage logging.** `/proxy/*` with streaming; asyncio queue + DuckDB background writer. *Done when:* a `curl` through the proxy returns the upstream response and writes a `usage_logs` row.
4. **Stats API.** `/apis/{id}/stats`, `/summary`, `/logs`. *Done when:* the endpoints return correct aggregates for logged traffic.
5. **Polish.** Cost map, error handling, tests, Dockerfile, compose wiring.
