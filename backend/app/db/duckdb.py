"""Analytical store: embedded DuckDB file holding usage logs.

DuckDB is single-writer: exactly one UsageStore is created per process and a
threading.Lock serialises all access (inserts happen in a background thread,
reads come from request handlers).
"""

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import duckdb

_SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_logs (
    ts                TIMESTAMP,
    proxy_token_id    VARCHAR,
    credential_id     VARCHAR,
    user_id           VARCHAR,
    status_code       INTEGER,
    path              VARCHAR,
    model             VARCHAR,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    total_tokens      INTEGER,
    latency_ms        INTEGER,
    cost_usd          DOUBLE
)
"""

_RANGES = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}
_INTERVALS = {"hour", "day"}


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass
class UsageEvent:
    proxy_token_id: str
    credential_id: str
    user_id: str
    status_code: int
    path: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    cost_usd: float
    ts: datetime = field(default_factory=_utcnow_naive)

    def as_row(self) -> tuple:
        return (
            self.ts,
            self.proxy_token_id,
            self.credential_id,
            self.user_id,
            self.status_code,
            self.path,
            self.model,
            self.prompt_tokens,
            self.completion_tokens,
            self.prompt_tokens + self.completion_tokens,
            self.latency_ms,
            self.cost_usd,
        )


class UsageStore:
    def __init__(self, path: str) -> None:
        self._conn = duckdb.connect(path)
        self._lock = threading.Lock()
        with self._lock:
            self._conn.execute(_SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # --- writes ---------------------------------------------------------

    def insert_batch(self, events: list[UsageEvent]) -> None:
        if not events:
            return
        rows = [e.as_row() for e in events]
        with self._lock:
            self._conn.executemany(
                "INSERT INTO usage_logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows
            )

    # --- reads ----------------------------------------------------------

    @staticmethod
    def parse_range(range_: str) -> datetime:
        td = _RANGES.get(range_)
        if td is None:
            raise ValueError(f"range must be one of {sorted(_RANGES)}")
        return _utcnow_naive() - td

    def stats(
        self,
        credential_id: str,
        since: datetime,
        interval: str,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if interval not in _INTERVALS:
            raise ValueError(f"interval must be one of {sorted(_INTERVALS)}")
        params: list[Any] = [credential_id, since]
        user_filter = ""
        if user_id is not None:
            user_filter = "AND user_id = ?"
            params.append(user_id)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT date_trunc('{interval}', ts) AS bucket,
                       count(*)                              AS requests,
                       coalesce(sum(total_tokens), 0)        AS total_tokens,
                       coalesce(avg(latency_ms), 0)          AS avg_latency_ms,
                       sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors,
                       coalesce(sum(cost_usd), 0)            AS cost_usd
                FROM usage_logs
                WHERE credential_id = ? AND ts >= ? {user_filter}
                GROUP BY 1 ORDER BY 1
                """,
                params,
            ).fetchall()
        keys = ("bucket", "requests", "total_tokens", "avg_latency_ms", "errors", "cost_usd")
        return [dict(zip(keys, r)) for r in rows]

    def summary(
        self, credential_id: str, since: datetime, user_id: str | None = None
    ) -> dict[str, Any]:
        params: list[Any] = [credential_id, since]
        user_filter = ""
        if user_id is not None:
            user_filter = "AND user_id = ?"
            params.append(user_id)
        with self._lock:
            row = self._conn.execute(
                f"""
                SELECT count(*)                        AS requests,
                       coalesce(sum(total_tokens), 0)  AS total_tokens,
                       coalesce(avg(latency_ms), 0)    AS avg_latency_ms,
                       coalesce(sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS errors,
                       coalesce(sum(cost_usd), 0)      AS cost_usd
                FROM usage_logs
                WHERE credential_id = ? AND ts >= ? {user_filter}
                """,
                params,
            ).fetchone()
        requests, total_tokens, avg_latency, errors, cost = row
        return {
            "requests": requests,
            "total_tokens": total_tokens,
            "avg_latency_ms": float(avg_latency),
            "error_rate": (errors / requests) if requests else 0.0,
            "cost_usd": float(cost),
        }

    def recent_logs(
        self,
        credential_id: str,
        limit: int = 50,
        before: datetime | None = None,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT ts, path, model, status_code, prompt_tokens, completion_tokens,
                   total_tokens, latency_ms, cost_usd
            FROM usage_logs
            WHERE credential_id = ?
        """
        params: list[Any] = [credential_id]
        if user_id is not None:
            query += " AND user_id = ?"
            params.append(user_id)
        if before is not None:
            query += " AND ts < ?"
            params.append(before)
        query += " ORDER BY ts DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(query, params).fetchall()
        keys = (
            "ts", "path", "model", "status_code", "prompt_tokens",
            "completion_tokens", "total_tokens", "latency_ms", "cost_usd",
        )
        return [dict(zip(keys, r)) for r in rows]

    def usage_by_member(
        self, credential_ids: list[str], since: datetime
    ) -> list[dict[str, Any]]:
        """Per-actor breakdown across one or more credentials — the "monitor
        individual teammates" view. Admin/owner only; enforced by the caller."""
        if not credential_ids:
            return []
        placeholders = ",".join("?" for _ in credential_ids)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT user_id,
                       count(*)                             AS requests,
                       coalesce(sum(total_tokens), 0)       AS total_tokens,
                       coalesce(sum(cost_usd), 0)           AS cost_usd,
                       sum(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors
                FROM usage_logs
                WHERE credential_id IN ({placeholders}) AND ts >= ?
                GROUP BY user_id ORDER BY requests DESC
                """,
                [*credential_ids, since],
            ).fetchall()
        keys = ("user_id", "requests", "total_tokens", "cost_usd", "errors")
        return [dict(zip(keys, r)) for r in rows]
