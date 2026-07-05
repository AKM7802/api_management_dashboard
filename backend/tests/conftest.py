"""Test fixtures. Env vars are set BEFORE importing the app (module-level engine)."""

import os
import tempfile
import time

_tmp = tempfile.mkdtemp(prefix="apimgmt-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["DUCKDB_PATH"] = f"{_tmp}/usage.duckdb"
os.environ["USAGE_FLUSH_INTERVAL_SECONDS"] = "0.05"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.postgres import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app = create_app()
    with TestClient(app) as c:
        yield c


# --- helpers shared across test modules --------------------------------------


def signup(client, email="user@example.com", password="password123") -> dict:
    """Create a user, return auth headers."""
    r = client.post("/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def create_api(client, headers, **overrides) -> dict:
    payload = {
        "name": "My OpenAI",
        "provider": "openai",
        "base_url": "http://upstream",
        "secret": "sk-real-secret-key-9876",
    }
    payload.update(overrides)
    r = client.post("/apis", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def create_token(client, headers, api_id: str, name="test token") -> dict:
    r = client.post(f"/apis/{api_id}/tokens", json={"name": name}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def wait_for_logs(client, headers, api_id: str, n: int = 1, timeout: float = 3.0) -> list:
    """Poll the logs endpoint until n rows appear (background flush is async)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = client.get(f"/apis/{api_id}/logs", headers=headers)
        assert r.status_code == 200, r.text
        rows = r.json()
        if len(rows) >= n:
            return rows
        time.sleep(0.05)
    raise AssertionError(f"expected {n} usage log rows, got {len(rows)}")


# --- teams / RBAC helpers -----------------------------------------------------


def whoami(client, headers) -> dict:
    r = client.get("/auth/me", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def create_team(client, headers, name="Test Team") -> dict:
    r = client.post("/teams", json={"name": name}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def team_headers(headers: dict, team_id: str) -> dict:
    return {**headers, "X-Team-Id": team_id}


def add_member_directly(team_id: str, user_id: str, role: str = "member") -> None:
    """Insert a TeamMembership row straight into the DB, bypassing the invite
    flow (Phase 2) — the invite/accept path itself is covered separately in
    test_invitations.py; most RBAC/grant tests just need a member present."""
    from app import models
    from app.db.postgres import SessionLocal

    with SessionLocal() as db:
        db.add(models.TeamMembership(team_id=team_id, user_id=user_id, role=role))
        db.commit()
