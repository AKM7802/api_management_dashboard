FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# install deps first for layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Single worker on purpose: DuckDB is single-writer (see docs/plans/README.md).
# On the shared Swarm, config arrives as a Docker secret mounted at
# /run/secrets/app_env (see infra repo's stack.yml) — source it into the process env
# before startup. Absent locally (docker-compose.yml sets env vars directly instead).
CMD ["sh", "-c", "[ -f /run/secrets/app_env ] && set -a && . /run/secrets/app_env && set +a; alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
