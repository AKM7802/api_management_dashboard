"""The reverse proxy: validate proxy token, inject the real key, stream back.

Authenticated by proxy token (`xpxy_live_...`), NOT by dashboard JWT.
"""

import time
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app import models
from app.config import get_settings
from app.db.duckdb import UsageEvent
from app.db.postgres import SessionLocal
from app.pricing import estimate_cost
from app.security import PROXY_TOKEN_PREFIX, decrypt_secret, hash_token
from app.usage import extract_model, extract_usage

router = APIRouter(tags=["proxy"])

# headers we never forward (either direction)
_SKIP_REQUEST_HEADERS = {
    "host", "authorization", "content-length", "connection", "x-api-key",
    "transfer-encoding", "keep-alive", "proxy-authorization", "te", "upgrade",
}
_SKIP_RESPONSE_HEADERS = {
    "content-length", "content-encoding", "transfer-encoding", "connection",
}

_HEAD_CAP = 32 * 1024  # first bytes kept for usage parsing (Anthropic message_start)
_TAIL_CAP = 64 * 1024  # last bytes kept (OpenAI final usage chunk / JSON bodies)


@dataclass
class ResolvedToken:
    token_id: str
    credential_id: str
    user_id: str
    provider: str
    base_url: str
    encrypted_secret: bytes
    token_status: str
    credential_status: str
    cached_at: float = 0.0


def _load_token(token_hash: str) -> ResolvedToken | None:
    """Blocking DB lookup; runs in the threadpool."""
    with SessionLocal() as db:
        token = db.scalar(
            select(models.ProxyToken).where(models.ProxyToken.token_hash == token_hash)
        )
        if token is None:
            return None
        cred = token.credential
        # opportunistic last-used update (throttled by the cache TTL)
        token.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return ResolvedToken(
            token_id=token.id,
            credential_id=cred.id,
            user_id=cred.user_id,
            provider=cred.provider,
            base_url=cred.base_url,
            encrypted_secret=cred.encrypted_secret,
            token_status=token.status,
            credential_status=cred.status,
        )


async def _resolve_token(request: Request, token_hash: str) -> ResolvedToken | None:
    """TTL-cached token resolution (in-process dict — no Redis in v1)."""
    cache: dict[str, ResolvedToken] = request.app.state.token_cache
    ttl = get_settings().proxy_token_cache_ttl_seconds
    hit = cache.get(token_hash)
    if hit is not None and (time.monotonic() - hit.cached_at) < ttl:
        return hit
    resolved = await run_in_threadpool(_load_token, token_hash)
    if resolved is not None:
        resolved.cached_at = time.monotonic()
        cache[token_hash] = resolved
    else:
        cache.pop(token_hash, None)
    return resolved


def _auth_headers(provider: str, secret: str, incoming: dict[str, str]) -> dict[str, str]:
    if provider == "anthropic":
        headers = {"x-api-key": secret}
        headers.setdefault(
            "anthropic-version", incoming.get("anthropic-version", "2023-06-01")
        )
        return headers
    # openai + custom default to bearer auth
    return {"Authorization": f"Bearer {secret}"}


@router.api_route(
    "/proxy/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def proxy(path: str, request: Request):
    # 1. proxy-token auth
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer " + PROXY_TOKEN_PREFIX):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid proxy token")
    resolved = await _resolve_token(request, hash_token(auth.removeprefix("Bearer ")))
    if resolved is None or resolved.token_status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown or revoked proxy token")
    if resolved.credential_status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This API is disabled")

    # 2. decrypt the real key in memory only
    try:
        secret = decrypt_secret(resolved.encrypted_secret)
    except ValueError:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Credential unavailable")

    # 3. build the upstream request (real key injected, client auth stripped)
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _SKIP_REQUEST_HEADERS
    }
    headers.update(_auth_headers(resolved.provider, secret, dict(request.headers)))
    url = f"{resolved.base_url}/{path.lstrip('/')}"
    if request.url.query:
        url += f"?{request.url.query}"

    client: httpx.AsyncClient = request.app.state.http_client
    model = extract_model(body)
    started = time.monotonic()

    def _log(status_code: int, content_type: str = "", head: bytes = b"", tail: bytes = b""):
        prompt, completion = extract_usage(content_type, head, tail)
        request.app.state.usage.record(
            UsageEvent(
                proxy_token_id=resolved.token_id,
                credential_id=resolved.credential_id,
                user_id=resolved.user_id,
                status_code=status_code,
                path="/" + path.lstrip("/"),
                model=model,
                prompt_tokens=prompt,
                completion_tokens=completion,
                latency_ms=int((time.monotonic() - started) * 1000),
                cost_usd=estimate_cost(resolved.provider, model, prompt, completion),
            )
        )

    # 4. dispatch upstream
    try:
        upstream = await client.send(
            client.build_request(request.method, url, headers=headers, content=body),
            stream=True,
        )
    except httpx.TimeoutException:
        _log(504)
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Upstream timed out")
    except httpx.HTTPError:
        _log(502)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Upstream unreachable")

    content_type = upstream.headers.get("content-type", "")

    # 5. stream the response through, keeping head/tail buffers for usage parsing
    async def relay():
        head = bytearray()
        tail = bytearray()
        try:
            async for chunk in upstream.aiter_bytes():
                if len(head) < _HEAD_CAP:
                    head.extend(chunk[: _HEAD_CAP - len(head)])
                tail.extend(chunk)
                if len(tail) > _TAIL_CAP:
                    del tail[: len(tail) - _TAIL_CAP]
                yield chunk
        finally:
            await upstream.aclose()
            # 6. log usage after the client got the last byte — never blocks them
            _log(upstream.status_code, content_type, bytes(head), bytes(tail))

    response_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in _SKIP_RESPONSE_HEADERS
    }
    return StreamingResponse(
        relay(), status_code=upstream.status_code, headers=response_headers
    )
