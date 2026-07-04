"""Usage logging (asyncio queue → DuckDB background writer) + stats endpoints.

No Kafka, no Redis: the proxy pushes events onto an in-process queue; one
background task batch-inserts into DuckDB. Logging never blocks a request.
"""

import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request

from app import models, schemas
from app.apis import get_owned_credential
from app.config import get_settings
from app.db.duckdb import UsageEvent, UsageStore


class UsageRecorder:
    """Owns the queue and the single DuckDB writer task."""

    def __init__(self, store: UsageStore, flush_interval: float, batch_size: int):
        self.store = store
        self._queue: asyncio.Queue[UsageEvent] = asyncio.Queue()
        self._flush_interval = flush_interval
        self._batch_size = batch_size
        self._task: asyncio.Task | None = None

    def record(self, event: UsageEvent) -> None:
        self._queue.put_nowait(event)

    def start(self) -> None:
        self._task = asyncio.get_running_loop().create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # flush anything still queued so nothing is lost on shutdown
        await asyncio.to_thread(self.store.insert_batch, self._drain())
        self.store.close()

    def _drain(self) -> list[UsageEvent]:
        batch: list[UsageEvent] = []
        while len(batch) < self._batch_size:
            try:
                batch.append(self._queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        return batch

    async def _run(self) -> None:
        while True:
            try:
                first = await asyncio.wait_for(
                    self._queue.get(), timeout=self._flush_interval
                )
                batch = [first, *self._drain()]
            except TimeoutError:
                continue
            await asyncio.to_thread(self.store.insert_batch, batch)


# --- token-usage extraction from upstream responses ---------------------------


def _iter_sse_json(buf: bytes):
    for line in buf.split(b"\n"):
        line = line.strip()
        if not line.startswith(b"data:"):
            continue
        payload = line[5:].strip()
        if not payload or payload == b"[DONE]":
            continue
        try:
            yield json.loads(payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue


def extract_usage(content_type: str, head: bytes, tail: bytes) -> tuple[int, int]:
    """Best-effort (prompt_tokens, completion_tokens) from an upstream response.

    Handles OpenAI + Anthropic, streaming (SSE) and plain JSON. Returns (0, 0)
    when nothing recognisable is found — logging must never fail a request.
    """
    prompt = completion = 0
    try:
        if "text/event-stream" in content_type:
            for obj in _iter_sse_json(head + b"\n" + tail):
                usage = obj.get("usage") or {}
                if obj.get("type") == "message_start":  # Anthropic
                    u = (obj.get("message") or {}).get("usage") or {}
                    prompt = u.get("input_tokens", prompt)
                elif obj.get("type") == "message_delta":  # Anthropic
                    completion = usage.get("output_tokens", completion)
                elif usage:  # OpenAI final chunk (stream_options.include_usage)
                    prompt = usage.get("prompt_tokens", prompt)
                    completion = usage.get("completion_tokens", completion)
        else:
            # tail holds the complete body whenever it fits the cap; a JSON body
            # larger than the cap would be truncated and unparseable regardless.
            body = json.loads(tail)
            usage = body.get("usage") or {}
            prompt = usage.get("prompt_tokens", usage.get("input_tokens", 0)) or 0
            completion = (
                usage.get("completion_tokens", usage.get("output_tokens", 0)) or 0
            )
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError, TypeError):
        pass
    return int(prompt), int(completion)


def extract_model(request_body: bytes) -> str:
    try:
        model = json.loads(request_body).get("model", "")
        return model if isinstance(model, str) else ""
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        return ""


# --- stats endpoints -----------------------------------------------------------

router = APIRouter(tags=["stats"])


def _store(request: Request) -> UsageStore:
    return request.app.state.usage.store


@router.get("/apis/{api_id}/stats", response_model=list[schemas.StatsBucket])
def api_stats(
    request: Request,
    cred: models.ApiCredential = Depends(get_owned_credential),
    range: str = Query("7d", pattern="^(24h|7d|30d)$"),
    interval: str = Query("day", pattern="^(hour|day)$"),
):
    since = UsageStore.parse_range(range)
    return _store(request).stats(cred.id, since, interval)


@router.get("/apis/{api_id}/stats/summary", response_model=schemas.StatsSummary)
def api_stats_summary(
    request: Request,
    cred: models.ApiCredential = Depends(get_owned_credential),
    range: str = Query("30d", pattern="^(24h|7d|30d)$"),
):
    since = UsageStore.parse_range(range)
    return _store(request).summary(cred.id, since)


@router.get("/apis/{api_id}/logs", response_model=list[schemas.UsageLogRow])
def api_logs(
    request: Request,
    cred: models.ApiCredential = Depends(get_owned_credential),
    limit: int = Query(50, ge=1, le=200),
    cursor: datetime | None = None,
):
    return _store(request).recent_logs(cred.id, limit=limit, before=cursor)


def build_recorder() -> UsageRecorder:
    settings = get_settings()
    return UsageRecorder(
        UsageStore(settings.duckdb_path),
        flush_interval=settings.usage_flush_interval_seconds,
        batch_size=settings.usage_flush_batch_size,
    )
