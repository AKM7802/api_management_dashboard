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

### Remaining
- Frontend dashboard (docs/plans/02-frontend-dashboard.md) — not started.
- Landing + onboarding (docs/plans/03-landing-onboarding.md) — not started.

### Notes for resumption
- Env: `uv` manages `backend/.venv` (Python 3.12). Run tests: `cd backend && uv run pytest -q`.
- Dev server: `cd backend && uv run uvicorn app.main:app --reload` (SQLite + local duckdb file by default; Postgres via `DATABASE_URL`).
- Known fix already applied: JSON usage parsing uses only the `tail` buffer (head+tail duplicated small bodies).
- Git repo initialized on `main`; checkpoint committed.
