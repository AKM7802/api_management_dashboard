# Running Locally

How to run the whole project (frontend + backend + databases) on your machine, plus dummy login data to try it with.

---

## Option A — Docker Compose (easiest, runs everything)

Starts all three services: PostgreSQL, the FastAPI backend, and the Next.js frontend.

```bash
cd /home/aswanth/Documents/api_mangament_dashboard
docker compose up --build
```

Then open:

| What | URL |
|------|-----|
| **Dashboard / landing page** | http://localhost:3000 |
| **Backend API docs (Swagger)** | http://localhost:8000/docs |
| **Backend health check** | http://localhost:8000/health |

Stop it with `Ctrl+C`, or fully tear down (including the databases) with:

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop AND wipe the postgres + duckdb volumes
```

> The first `up` builds images and can take a few minutes. Later runs are fast.
> Data persists between runs in Docker volumes (`pgdata`, `duckdata`) until you use `-v`.

---

## Option B — Run each part by hand (for development)

Useful when you're editing code and want hot-reload.

### 1. Start PostgreSQL

Either use the compose Postgres on its own:

```bash
docker compose up postgres
```

…or point the backend at any Postgres you already have (or just use SQLite — see below).

### 2. Backend (FastAPI)

```bash
cd backend
uv sync                                   # installs deps into backend/.venv
uv run uvicorn app.main:app --reload      # http://localhost:8000
```

By default (no env vars) the backend uses a local **SQLite** file and a local
**DuckDB** file — zero setup, perfect for dev. To use the compose Postgres instead:

```bash
DATABASE_URL=postgresql+psycopg://apimgmt:apimgmt@localhost:5432/apimgmt \
  uv run uvicorn app.main:app --reload
```

Run the backend tests any time:

```bash
cd backend && uv run pytest -q          # 31 tests
```

### 3. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev                              # http://localhost:3000
```

The frontend reads the backend URL from `NEXT_PUBLIC_API_URL`
(defaults to `http://localhost:8000`, already set in `frontend/.env.local`).

---

## Dummy login data

These accounts already exist in the Docker Compose database (seeded end-to-end
through the real UI, covering personal APIs, teams, and RBAC). Use them at
**http://localhost:3000/login**:

| Email | Password | Notes |
|-------|----------|-------|
| `alice@dummy.io` | `alicepass123` | Personal mode only. 2 APIs: one LLM-shaped (auto-detected from real token usage — no provider is ever declared) and one plain non-LLM API. Both have request history. |
| `bob@dummy.io` | `bobpass12345` | Owner of the **Acme Corp** team (switch to it via the context switcher, top-left). Added "Acme Billing API" as a team API, with his own usage. Team settings → Usage shows the per-member breakdown (himself + Carol). |
| `carol@dummy.io` | `carolpass123` | Member of **Acme Corp**, granted access to "Acme Billing API" by Bob. Her dashboard (in team context) only shows that one API and only her own usage — never Bob's. |

> These live in the Postgres volume. They disappear if you run `docker compose down -v`,
> or if you run the backend locally with the default SQLite (a separate, empty database).
> In that case just sign up a new account at **/signup** — it takes 5 seconds.

To create your own account instead, go to **http://localhost:3000/signup**
(any email + a password of 8+ characters). Registering an API never asks for a
provider — just a name, a base URL, and a key; whether it's treated as an LLM
API (token/cost metrics shown) is detected automatically the first time a
response reports token usage.

---

## Trying the full flow

Once logged in:

1. **Add an API** — click "Add API", give it a name, the base URL, and your
   real upstream key (it's encrypted at rest). There's no provider to pick —
   any HTTP API works the same way.
2. **Create a proxy token** — open the API → **Tokens** tab → "Create token".
   Copy the `xpxy_live_...` token shown (it's only shown once).
3. **Use the proxy** — call the gateway with the proxy token instead of your real key.
   The Tokens tab shows a ready-to-copy `curl` snippet, e.g.:

   ```bash
   curl http://localhost:8000/proxy/v1/chat/completions \
     -H "Authorization: Bearer xpxy_live_..." \
     -H "Content-Type: application/json" \
     -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
   ```

4. **See usage** — open the API → **Usage** tab for request/token/latency charts
   and a recent-requests table.

### Testing without a real upstream key

You don't need a real OpenAI/Anthropic key to see it work. Point your API at
any JSON endpoint you control — nothing about registration is provider-specific.
There's a ready-made dummy upstream used for testing at
`scratchpad/mock_upstream.py` — run it and register an API with base URL
`http://localhost:9999` (or `http://172.17.0.1:9999` from inside the Docker
backend container).

---

## Ports summary

| Service | Port |
|---------|------|
| Frontend (Next.js) | 3000 |
| Backend (FastAPI) | 8000 |
| PostgreSQL | 5432 |

If a port is already in use, stop whatever's using it or change the mapping in
`docker-compose.yml`.

---

## Configuration (env vars)

| Var | Default | Set for production |
|-----|---------|--------------------|
| `DATABASE_URL` | `sqlite:///./dev.db` (compose uses Postgres) | your Postgres URL |
| `DUCKDB_PATH` | `./usage.duckdb` (compose: `/data/usage.duckdb`) | a persistent path |
| `JWT_SECRET` | dev value | **a real secret** |
| `ENCRYPTION_KEY` | dev value | **a real Fernet key** ↓ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | your backend's public URL |

Generate a production encryption key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
