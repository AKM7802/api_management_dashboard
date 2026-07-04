"""Full proxy loop against a mock upstream (in-process ASGI app)."""

import json

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from tests.conftest import create_api, create_token, signup, wait_for_logs


def build_mock_upstream() -> FastAPI:
    upstream = FastAPI()

    @upstream.post("/v1/chat/completions")
    async def chat(request: Request):
        body = await request.json()
        echo = {
            "x-echo-authorization": request.headers.get("authorization", ""),
            "x-echo-x-api-key": request.headers.get("x-api-key", ""),
        }
        if body.get("stream"):
            async def sse():
                yield b'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
                yield b'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
                yield b'data: {"usage":{"prompt_tokens":12,"completion_tokens":34}}\n\n'
                yield b"data: [DONE]\n\n"

            return StreamingResponse(sse(), media_type="text/event-stream", headers=echo)
        return JSONResponse(
            {
                "choices": [{"message": {"content": "Hello"}}],
                "usage": {"prompt_tokens": 7, "completion_tokens": 5},
            },
            headers=echo,
        )

    @upstream.post("/v1/messages")
    async def anthropic_messages(request: Request):
        echo = {"x-echo-x-api-key": request.headers.get("x-api-key", "")}

        async def sse():
            yield (
                b'data: {"type":"message_start","message":{"usage":{"input_tokens":21}}}\n\n'
            )
            yield b'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n'
            yield b'data: {"type":"message_delta","usage":{"output_tokens":9}}\n\n'

        return StreamingResponse(sse(), media_type="text/event-stream", headers=echo)

    @upstream.get("/v1/models")
    async def models():
        return JSONResponse({"data": [{"id": "gpt-4o"}]})

    return upstream


@pytest.fixture()
def proxied(client):
    """client + mock upstream wired into the app's http client."""
    client.app.state.http_client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=build_mock_upstream()),
        base_url="http://upstream",
    )
    return client


def _setup(client, provider="openai"):
    headers = signup(client)
    api = create_api(client, headers, provider=provider)
    token = create_token(client, headers, api["id"])
    return headers, api, token["token"]


def test_proxy_json_roundtrip_and_usage_logged(proxied):
    headers, api, raw = _setup(proxied)

    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 200
    assert r.json()["choices"][0]["message"]["content"] == "Hello"
    # real key injected upstream, proxy token stripped
    assert r.headers["x-echo-authorization"] == "Bearer sk-real-secret-key-9876"

    rows = wait_for_logs(proxied, headers, api["id"])
    row = rows[0]
    assert row["path"] == "/v1/chat/completions"
    assert row["model"] == "gpt-4o"
    assert row["prompt_tokens"] == 7
    assert row["completion_tokens"] == 5
    assert row["total_tokens"] == 12
    assert row["status_code"] == 200
    assert row["cost_usd"] > 0


def test_proxy_sse_stream_passthrough(proxied):
    headers, api, raw = _setup(proxied)

    with proxied.stream(
        "POST",
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "stream": True, "messages": []},
        headers={"Authorization": f"Bearer {raw}"},
    ) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = b"".join(r.iter_bytes())
    assert b'"content":"Hel"' in body
    assert b"data: [DONE]" in body

    row = wait_for_logs(proxied, headers, api["id"])[0]
    assert row["prompt_tokens"] == 12
    assert row["completion_tokens"] == 34


def test_proxy_anthropic_header_and_usage(proxied):
    headers, api, raw = _setup(proxied, provider="anthropic")

    with proxied.stream(
        "POST",
        "/proxy/v1/messages",
        json={"model": "claude-sonnet-5", "messages": []},
        headers={"Authorization": f"Bearer {raw}"},
    ) as r:
        assert r.status_code == 200
        echoed_key = r.headers["x-echo-x-api-key"]
        b"".join(r.iter_bytes())
    assert echoed_key == "sk-real-secret-key-9876"

    row = wait_for_logs(proxied, headers, api["id"])[0]
    assert row["prompt_tokens"] == 21
    assert row["completion_tokens"] == 9
    assert row["model"] == "claude-sonnet-5"


def test_proxy_rejects_bad_tokens(proxied):
    headers, api, raw = _setup(proxied)

    # no token
    assert proxied.post("/proxy/v1/chat/completions", json={}).status_code == 401
    # malformed token
    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={},
        headers={"Authorization": "Bearer not-a-proxy-token"},
    )
    assert r.status_code == 401
    # unknown token
    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={},
        headers={"Authorization": "Bearer xpxy_live_unknown0000"},
    )
    assert r.status_code == 401


def test_proxy_rejects_revoked_token_and_disabled_api(proxied):
    headers, api, raw = _setup(proxied)
    token_id = proxied.get(f"/apis/{api['id']}/tokens", headers=headers).json()[0]["id"]

    # revoke → 401 (cache is bypassed because revoke happens before first proxy call)
    proxied.delete(f"/tokens/{token_id}", headers=headers)
    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert r.status_code == 401

    # new token but disabled credential → 403
    token2 = create_token(proxied, headers, api["id"])
    proxied.patch(f"/apis/{api['id']}", json={"status": "disabled"}, headers=headers)
    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={},
        headers={"Authorization": f"Bearer {token2['token']}"},
    )
    assert r.status_code == 403


def test_proxy_get_passthrough(proxied):
    headers, api, raw = _setup(proxied)
    r = proxied.get(
        "/proxy/v1/models", headers={"Authorization": f"Bearer {raw}"}
    )
    assert r.status_code == 200
    assert r.json()["data"][0]["id"] == "gpt-4o"
