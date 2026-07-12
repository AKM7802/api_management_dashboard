# Production Deployment Guide

How to deploy this project to production as separate, independently-built services: which services exist, what environment variables each one needs, and a concrete step-by-step path to get it live behind HTTPS.

---

## 1. Architecture — what "separate services" means here

```
                              ┌──────────────────────┐
   Browser  ───HTTPS───▶      │  Caddy (reverse proxy) │
                              │   :80 / :443           │
                              └──────────┬─────────────┘
                                 │                 │
                     app.example.com        api.example.com
                                 │                 │
                                 ▼                 ▼
                        ┌────────────────┐  ┌────────────────────┐
                        │   frontend     │  │      backend        │
                        │   Next.js      │  │      FastAPI         │
                        │   :3000        │  │      :8000           │
                        └────────────────┘  └─────────┬───────────┘
                                                         │
                                              ┌──────────┴───────────┐
                                              ▼                      ▼
                                      ┌───────────────┐   ┌────────────────────┐
                                      │  PostgreSQL    │   │  DuckDB (file)     │
                                      │  (users, teams, │  │  (usage_logs —     │
                                      │  APIs, tokens)  │  │  analytics)        │
                                      └───────────────┘   └────────────────────┘
```

The browser talks to **two different origins directly** — the frontend for pages, and the backend for API calls (the frontend never proxies API requests through itself). That's why CORS and two separate public URLs matter here, not just one.

| Service | What it is | Stateful? | Scales horizontally? |
|---|---|---|---|
| **frontend** | Next.js app (dashboard + landing) | No | Yes, freely |
| **backend** | FastAPI app (auth, API/token CRUD, proxy, usage stats) | No (state lives in Postgres/DuckDB) | **No — run exactly one instance** (see [Scaling](#7-scaling--concurrency)) |
| **postgres** | Transactional store: users, teams, APIs, tokens, grants | Yes | Standard Postgres HA if you need it |
| **DuckDB file** | Analytical store: one row per proxied request, feeds every usage graph | Yes (a file, not a server) | N/A — lives on a volume next to the single backend instance |
| **reverse proxy** (Caddy in this guide) | TLS termination + routing to the two app services | No | Yes |

There is no separate "usage service" or message queue — the backend batches usage events into DuckDB itself via an in-process background task. Nothing else to provision for that.

---

## 2. Prerequisites

- A host (VPS, VM, or equivalent) with Docker + Docker Compose v2 installed. One small VM (1–2 vCPU / 2GB RAM) is enough to start.
- Two DNS records pointed at that host's IP: one for the frontend (e.g. `app.example.com`), one for the backend (e.g. `api.example.com`). They must be **different hostnames** — the browser needs two distinct origins to apply CORS correctly.
- Ports 80 and 443 open on the host (Caddy issues and renews TLS certs automatically via Let's Encrypt over port 80/443 — no manual certbot step needed).

---

## 3. Environment variables reference

### Backend (`backend/app/config.py`)

| Var | Required in prod | Default (dev only) | Notes |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `sqlite:///./dev.db` | Postgres connection string: `postgresql+psycopg://user:pass@host:5432/dbname`. SQLite is dev/test-only. |
| `DUCKDB_PATH` | Recommended | `./usage.duckdb` | Path to the analytics file. Must be on a **persistent volume** — losing it loses usage history (not auth/API data, which is in Postgres). |
| `JWT_SECRET` | **Yes** | insecure dev value | Signs session tokens. Generate: `openssl rand -hex 32`. Rotating it invalidates every logged-in session. |
| `ENCRYPTION_KEY` | **Yes** | insecure dev value | Fernet key encrypting upstream API keys at rest. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. **Back this up separately from your Postgres backups** — losing it makes every stored upstream API key unrecoverable, even though the encrypted bytes are still in the database. |
| `CORS_ORIGINS` | **Yes** | `http://localhost:3000` | Comma-separated list of browser origins allowed to call this API — set to your frontend's public URL(s), e.g. `https://app.example.com`. |
| `JWT_ALGORITHM` | No | `HS256` | Leave as-is unless you have a reason to change it. |
| `JWT_EXPIRE_MINUTES` | No | `1440` (24h) | Session length. |
| `PROXY_TOKEN_CACHE_TTL_SECONDS` | No | `30` | How long a proxy token's validity is cached before re-checking the DB (revoke/disable takes effect immediately regardless — see `app/token_cache.py`). |
| `UPSTREAM_TIMEOUT_SECONDS` | No | `120` | Timeout for requests the proxy forwards to your registered upstream APIs. |
| `USAGE_FLUSH_INTERVAL_SECONDS` / `USAGE_FLUSH_BATCH_SIZE` | No | `1.0` / `100` | How often/how many usage rows are batched into DuckDB. |

### Frontend (`frontend/lib/api.ts`)

| Var | Required in prod | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes** | The backend's public URL, e.g. `https://api.example.com`. **This is a Next.js build-time variable — it gets inlined into the JS bundle when you run `next build` / `docker build`, not read at container start.** Changing it later means rebuilding the frontend image, not just restarting the container or editing env vars on a running one. |

There is no database URL, secret, or server-only env var on the frontend — it's a static/SSR app that only ever talks to the backend's public HTTP API.

---

## 4. Step-by-step: single-host Docker Compose deployment

This is the fastest path to a real HTTPS deployment and matches the repo's existing `docker-compose.yml`. It uses [Caddy](https://caddyserver.com/) as the reverse proxy because it gets you automatic Let's Encrypt TLS with a 6-line config — no separate certbot setup.

### 4.1 Get the code onto the host

```bash
git clone <your-repo-url> api_mangament_dashboard
cd api_mangament_dashboard
```

### 4.2 Fill in secrets

```bash
cp .env.prod.example .env.prod
```

Edit `.env.prod`:
- `POSTGRES_PASSWORD` — generate with `openssl rand -hex 24`
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `ENCRYPTION_KEY` — generate with `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `FRONTEND_URL` — your real frontend domain, e.g. `https://app.example.com`
- `BACKEND_URL` — your real backend domain, e.g. `https://api.example.com`

`.env.prod` is already git-ignored — it never gets committed.

### 4.3 Point DNS at the host

Create A (or AAAA) records for both `app.example.com` and `api.example.com` pointing at the host's IP. Caddy can't issue certificates until these resolve.

### 4.4 Configure Caddy

```bash
cp Caddyfile.example Caddyfile
```

Edit `Caddyfile`: replace `app.example.com` / `api.example.com` with your real domains, and `you@example.com` with a real address (Let's Encrypt uses it for renewal/expiry notices, not for login).

### 4.5 Build and start everything

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This builds the `backend` and `frontend` images, starts Postgres, waits for it to be healthy, runs Alembic migrations automatically (baked into the backend's `Dockerfile` `CMD`), and brings up Caddy last. First run takes a few minutes; DNS + cert issuance can add another minute after that.

### 4.6 Verify

```bash
curl -s https://api.example.com/health        # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" https://app.example.com
```

Then open `https://app.example.com` in a browser, sign up, add an API, and confirm the proxy round-trips (Usage tab should show a request after you call your proxy token).

### 4.7 View logs / status

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml ps
```

---

## 5. Updating / redeploying

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

- Only `backend` and `frontend` get rebuilt/recreated when their source changes (Compose diffs the build). `postgres` and `caddy` are untouched.
- Recreating the `backend` container is safe and loses nothing: all real data (users, APIs, tokens, usage logs) lives in the `pgdata` and `duckdata` **named volumes**, not inside the container.
- If you only changed `NEXT_PUBLIC_API_URL` (i.e. you moved the backend to a new domain), you must rebuild the **frontend** image specifically — a plain restart won't pick it up (see [§3](#3-environment-variables-reference)).

---

## 6. Backups

| What | Where | How |
|---|---|---|
| Postgres (auth, APIs, tokens, teams) | `pgdata` volume | `docker compose -f docker-compose.prod.yml exec postgres pg_dump -U apimgmt apimgmt > backup.sql` on a schedule (cron). This is the data that matters most — losing it means losing every account and API registration. |
| DuckDB (usage history) | `duckdata` volume | Copy the file: `docker compose -f docker-compose.prod.yml exec backend cp /data/usage.duckdb /data/usage.duckdb.bak` then pull it off the host. Losing this loses historical graphs only — not accounts, APIs, or the ability to keep logging new usage. |
| `ENCRYPTION_KEY` | Wherever you generated it | Store it in a password manager / secrets vault **separately** from the Postgres backup. A Postgres backup without this key is useless for recovering upstream API keys — the encrypted bytes can never be decrypted without it. |

---

## 7. Scaling & concurrency

**Run exactly one `backend` container.** This is a deliberate v1 trade-off, not an oversight: DuckDB is single-writer, and the backend's proxy-token cache is an in-process dict (`app.state.token_cache`) with no cross-instance invalidation. Running two backend replicas behind a load balancer would give you silently inconsistent token revocation and a corrupted/contended usage-analytics file. The included `docker-compose.prod.yml` doesn't set `deploy.replicas` for exactly this reason — don't add it for `backend`.

What you *can* scale freely:
- **`frontend`** — stateless, scale to as many replicas as you want.
- **`postgres`** — standard Postgres scaling/HA (managed Postgres, read replicas, etc.) applies normally; it isn't part of the single-writer constraint.
- **`caddy`** — can run multiple instances behind a cloud load balancer if needed.

If you outgrow a single backend instance (high request volume needing more CPU for the proxy path), the documented upgrade path is to swap DuckDB for **TimescaleDB** (a Postgres extension) using the same `usage_logs` schema — see `docs/plans/README.md` for the rationale. That's a backend code change, not a deployment one.

---

## 8. Security checklist

- [ ] `JWT_SECRET` and `ENCRYPTION_KEY` are real generated values, not the dev fallbacks in `config.py` (the app will start with the dev fallback if you forget to set them — it will not fail loudly, so double-check).
- [ ] `CORS_ORIGINS` lists only your real frontend origin(s) — not `*`, not `localhost`.
- [ ] Postgres is not published to the public internet — in `docker-compose.prod.yml` it has no `ports:` mapping, only reachable from `backend` over the private compose network. Keep it that way, or firewall it if you move it off-box.
- [ ] TLS is enforced end to end — Caddy handles this automatically; don't also publish `backend`'s or `frontend`'s ports directly to the host (the prod compose file already omits this).
- [ ] `/auth/signup` is open/public by default (anyone can create an account). If you want an invite-only deployment, put an access gate in front of it (e.g. Caddy basic auth on that one route, or disable the route) — there's no built-in "invite-only signup" toggle in the app today.
- [ ] Back up `ENCRYPTION_KEY` separately from the database (see [§6](#6-backups)).

---

## 9. Troubleshooting

**Proxy calls return `502 {"detail": "Upstream unreachable"}`**
The backend container couldn't reach the `base_url` you registered for that API. The most common cause: you pointed `base_url` at `localhost:<port>` meaning "a service on my machine," but from *inside* the backend container, `localhost` means the container itself. If the upstream is running on the same host as the backend (outside Docker), use `http://host.docker.internal:<port>` instead, and make sure that upstream is bound to `0.0.0.0`, not `127.0.0.1` (a `127.0.0.1`-bound service is unreachable even via `host.docker.internal`). `docker-compose.prod.yml` already sets `extra_hosts: host.docker.internal:host-gateway` so this resolves correctly on Linux.

**Frontend loads but every API call fails / console shows a CORS error**
`CORS_ORIGINS` on the backend doesn't include the frontend's exact origin (scheme + host, e.g. `https://app.example.com` — no trailing slash, no path). Update it and recreate the `backend` container.

**Changed `NEXT_PUBLIC_API_URL` but the frontend still calls the old backend URL**
Expected — it's baked in at build time. Rebuild: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build frontend`.

**Caddy won't get a certificate**
DNS for that hostname doesn't resolve to the host yet, or ports 80/443 are blocked by a firewall/security group. Caddy needs both to complete the Let's Encrypt HTTP challenge.

---

## 10. Alternative: separate managed platforms

Everything above assumes one host running all services via Compose. The same environment variables map directly onto a split-platform deployment if you'd rather not manage a VM:

| Service | Example platform | What you'd configure there |
|---|---|---|
| `frontend` | Vercel, Netlify | Set `NEXT_PUBLIC_API_URL` as a build-time env var to your backend's platform URL. |
| `backend` | Fly.io, Render, Railway | Set `DATABASE_URL`, `DUCKDB_PATH` (pointed at that platform's persistent volume/disk feature), `JWT_SECRET`, `ENCRYPTION_KEY`, `CORS_ORIGINS`. Constrain to **one instance/replica** — see [§7](#7-scaling--concurrency). |
| `postgres` | Neon, Supabase, RDS, or the platform's managed Postgres add-on | Use the connection string it gives you as `DATABASE_URL` (add `+psycopg` after `postgresql` if the platform gives you a bare `postgresql://` URL). |

The one constraint that doesn't change: the backend still needs a **persistent disk** for the DuckDB file and still must run as a single instance, so pick a platform/plan that offers a persistent volume, not purely ephemeral/stateless containers, for that service.
