# API Management Dashboard

Manage your API keys in one place: add an upstream API (OpenAI, Anthropic, or any custom base URL), get a safe **proxy token** (`xpxy_live_...`) to use instead of the real key, and watch per-API usage statistics in a dashboard.

- **Backend:** Python / FastAPI · PostgreSQL (transactional) · DuckDB (analytical)
- **Frontend:** Next.js (dashboard + landing) — *in progress*
- Plans live in [`docs/plans/`](docs/plans/README.md).
- **Full local-run guide + dummy logins:** [`docs/RUNNING_LOCALLY.md`](docs/RUNNING_LOCALLY.md).

## Run with Docker

```bash
docker compose up --build
# API docs: http://localhost:8000/docs
```

## Run locally (dev)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload   # SQLite + local usage.duckdb by default
```

## Try the whole loop

```bash
# 1. sign up
TOKEN=$(curl -s -X POST localhost:8000/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"password123"}' | jq -r .access_token)

# 2. add an API (your real upstream key — stored encrypted)
API_ID=$(curl -s -X POST localhost:8000/apis -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"OpenAI","provider":"openai","base_url":"https://api.openai.com","secret":"sk-..."}' | jq -r .id)

# 3. mint a proxy token (shown once!)
PROXY=$(curl -s -X POST localhost:8000/apis/$API_ID/tokens -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"my app"}' | jq -r .token)

# 4. call the upstream THROUGH the proxy with the proxy token
curl -s localhost:8000/proxy/v1/chat/completions \
  -H "authorization: Bearer $PROXY" -H 'content-type: application/json' \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'

# 5. see the usage
curl -s "localhost:8000/apis/$API_ID/stats/summary?range=24h" -H "authorization: Bearer $TOKEN"
```

## Tests

```bash
cd backend && uv run pytest -q
```

## Configuration (env vars)

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `sqlite:///./dev.db` | use PostgreSQL in production |
| `DUCKDB_PATH` | `./usage.duckdb` | analytical store file |
| `JWT_SECRET` | dev value | **set in production** |
| `ENCRYPTION_KEY` | dev value | Fernet key — **set in production** |
