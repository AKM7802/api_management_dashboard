# Checkpoint — 2026-07-04 (updated)

## State: Backend COMPLETE (all 5 phases). Next: frontend (docs/plans/02).

Phase 5 verified: `docker compose up --build` boots postgres + backend (alembic
migrates on start), and an end-to-end smoke test passed against the live stack
(signup → add API → mint token → proxied request with real-key injection →
usage row in DuckDB → stats summary correct).

## Earlier state: Backend Phases 1–4 COMPLETE, all 27 tests passing

`cd backend && uv run pytest -q` → **27 passed**.

### Done (per docs/plans/01-backend-fastapi.md)
- **Phase 1 — skeleton + auth:** FastAPI app, config (`app/config.py`), SQLAlchemy models (`app/models.py`), signup/login/JWT + `/auth/me` (`app/auth.py`). PyJWT + bcrypt used (instead of python-jose/passlib — both unmaintained).
- **Phase 2 — APIs + tokens:** encrypted-secret CRUD (`app/apis.py`, Fernet in `app/security.py`), proxy tokens with sha256 hash + show-once raw (`app/tokens.py`).
- **Phase 3 — proxy + usage logging:** `/proxy/{path}` with httpx streaming, TTL token cache, header injection (OpenAI bearer / Anthropic x-api-key), head/tail buffers for usage parsing (`app/proxy.py`); asyncio queue → DuckDB background writer (`app/usage.py`, `app/db/duckdb.py`).
- **Phase 4 — stats API:** `/apis/{id}/stats`, `/stats/summary`, `/logs` from DuckDB (in `app/usage.py`).
- Pricing map done early (`app/pricing.py`).
- Tests: `backend/tests/` — security, auth, apis, tokens, proxy (mock ASGI upstream), stats.

### Phase 5 — DONE
- Alembic (`backend/alembic/`, `prepend_sys_path = .` fix), initial migration `0001`.
- `backend/Dockerfile` (single uvicorn worker — DuckDB single-writer), root `docker-compose.yml` (postgres + backend), root `README.md`.

### Frontend (plans 02 + 03) — DONE except final compose-image verification
- Next.js 16 (App Router) + Tailwind v4 + shadcn/ui (**base-nova preset, @base-ui — use `render` prop, not `asChild`**) + TanStack Query + Recharts.
- Pages: `/` landing (SSG, SEO metadata, robots.ts), `/login`, `/signup`, `/dashboard` (API list), `/apis/new`, `/apis/[id]` (Overview | Tokens | Usage tabs).
- Auth: JWT in localStorage (v1), client-side guard in `(dashboard)/layout.tsx`, `lib/api.ts` fetch wrapper (401 → redirect).
- Tokens: create with show-once dialog + copy + curl snippet; revoke.
- Usage: metric/range Tabs, Recharts area chart, KPI StatCards, recent-request table.
- Verified: `npm run build` clean; served pages render (landing/login/signup/dashboard); CORS preflight from :3000 passes against backend.
- `frontend/Dockerfile` + compose `frontend` service added (docker image build was still running at checkpoint — verify with `docker compose build frontend`).

### Remaining (nice-to-haves, not blockers)
- Playwright e2e for the browser flow (backend flow already covered by pytest + smoke script).
- shadcn `toggle-group` was unreachable (registry timeout) — used Tabs as segmented control instead; fine as-is.

### Notes for resumption
- Env: `uv` manages `backend/.venv` (Python 3.12). Run tests: `cd backend && uv run pytest -q`.
- Dev server: `cd backend && uv run uvicorn app.main:app --reload` (SQLite + local duckdb file by default; Postgres via `DATABASE_URL`).
- Known fix already applied: JSON usage parsing uses only the `tail` buffer (head+tail duplicated small bodies).
- Git repo initialized on `main`; checkpoint committed.
