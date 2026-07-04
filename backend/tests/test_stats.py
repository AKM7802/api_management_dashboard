"""Stats endpoints: seed usage rows directly into the store, assert aggregates."""

from datetime import datetime, timedelta, timezone

from app.db.duckdb import UsageEvent

from tests.conftest import create_api, signup


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _seed(client, api_id: str, user_id: str = "u1"):
    store = client.app.state.usage.store
    now = _now()
    events = [
        UsageEvent(
            proxy_token_id="t1", credential_id=api_id, user_id=user_id,
            status_code=200, path="/v1/chat/completions", model="gpt-4o",
            prompt_tokens=100, completion_tokens=50, latency_ms=200, cost_usd=0.001,
            ts=now - timedelta(hours=1),
        ),
        UsageEvent(
            proxy_token_id="t1", credential_id=api_id, user_id=user_id,
            status_code=500, path="/v1/chat/completions", model="gpt-4o",
            prompt_tokens=10, completion_tokens=0, latency_ms=100, cost_usd=0.0,
            ts=now - timedelta(hours=2),
        ),
        UsageEvent(
            proxy_token_id="t1", credential_id=api_id, user_id=user_id,
            status_code=200, path="/v1/chat/completions", model="gpt-4o",
            prompt_tokens=200, completion_tokens=100, latency_ms=300, cost_usd=0.002,
            ts=now - timedelta(days=2),
        ),
    ]
    store.insert_batch(events)


def test_summary(client):
    headers = signup(client)
    api = create_api(client, headers)
    _seed(client, api["id"])

    r = client.get(f"/apis/{api['id']}/stats/summary?range=30d", headers=headers)
    assert r.status_code == 200
    s = r.json()
    assert s["requests"] == 3
    assert s["total_tokens"] == 460  # 150 + 10 + 300
    assert s["error_rate"] == 1 / 3
    assert s["avg_latency_ms"] == 200.0
    assert abs(s["cost_usd"] - 0.003) < 1e-9

    # narrower range excludes the 2-day-old row
    s24 = client.get(
        f"/apis/{api['id']}/stats/summary?range=24h", headers=headers
    ).json()
    assert s24["requests"] == 2


def test_stats_timeseries(client):
    headers = signup(client)
    api = create_api(client, headers)
    _seed(client, api["id"])

    r = client.get(
        f"/apis/{api['id']}/stats?range=7d&interval=day", headers=headers
    )
    assert r.status_code == 200
    buckets = r.json()
    assert len(buckets) == 2  # today-ish rows + the 2-day-old row
    total_requests = sum(b["requests"] for b in buckets)
    assert total_requests == 3

    r = client.get(
        f"/apis/{api['id']}/stats?range=24h&interval=hour", headers=headers
    )
    hourly = r.json()
    assert len(hourly) == 2  # two distinct hours
    assert all(b["requests"] == 1 for b in hourly)


def test_logs_endpoint_with_limit(client):
    headers = signup(client)
    api = create_api(client, headers)
    _seed(client, api["id"])

    r = client.get(f"/apis/{api['id']}/logs?limit=2", headers=headers)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    # newest first
    assert rows[0]["latency_ms"] == 200
    assert rows[1]["latency_ms"] == 100


def test_stats_isolated_per_user(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    api_a = create_api(client, headers_a)
    _seed(client, api_a["id"])

    # B cannot read A's stats at all
    assert (
        client.get(f"/apis/{api_a['id']}/stats/summary", headers=headers_b).status_code
        == 404
    )


def test_invalid_range_rejected(client):
    headers = signup(client)
    api = create_api(client, headers)
    r = client.get(f"/apis/{api['id']}/stats?range=99y", headers=headers)
    assert r.status_code == 422
