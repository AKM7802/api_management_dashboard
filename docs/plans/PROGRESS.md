# Checkpoint — 2026-07-04

## State: Backend Phases 1–4 COMPLETE, all 27 tests passing

`cd backend && uv run pytest -q` → **27 passed**.

### Done (per docs/plans/01-backend-fastapi.md)
- **Phase 1 — skeleton + auth:** FastAPI app, config (`app/config.py`), SQLAlchemy models (`app/models.py`), signup/login/JWT + `/auth/me` (`app/auth.py`). PyJWT + bcrypt used (instead of python-jose/passlib — both unmaintained).
- **Phase 2 — APIs + tokens:** encrypted-secret CRUD (`app/apis.py`, Fernet in `app/security.py`), proxy tokens with sha256 hash + show-once raw (`app/tokens.py`).
- **Phase 3 — proxy + usage logging:** `/proxy/{path}` with httpx streaming, TTL token cache, header injection (OpenAI bearer / Anthropic x-api-key), head/tail buffers for usage parsing (`app/proxy.py`); asyncio queue → DuckDB background writer (`app/usage.py`, `app/db/duckdb.py`).
- **Phase 4 — stats API:** `/apis/{id}/stats`, `/stats/summary`, `/logs` from DuckDB (in `app/usage.py`).
- Pricing map done early (`app/pricing.py`).
- Tests: `backend/tests/` — security, auth, apis, tokens, proxy (mock ASGI upstream), stats.

### Remaining — Phase 5 (task #5, pending)
1. **Alembic** setup (plan calls for it; currently `init_db()` create_all only).
2. **backend/Dockerfile** (python:3.12-slim, single uvicorn worker — DuckDB single-writer).
3. **docker-compose.yml** at repo root (postgres + backend; frontend later).
4. **.gitignore** + root README run instructions.
5. Then: frontend (plan 02), landing (plan 03).

### Notes for resumption
- Env: `uv` manages `backend/.venv` (Python 3.12). Run tests: `cd backend && uv run pytest -q`.
- Dev server: `cd backend && uv run uvicorn app.main:app --reload` (SQLite + local duckdb file by default; Postgres via `DATABASE_URL`).
- Known fix already applied: JSON usage parsing uses only the `tail` buffer (head+tail duplicated small bodies).
- Git repo initialized on `main`; checkpoint committed.
