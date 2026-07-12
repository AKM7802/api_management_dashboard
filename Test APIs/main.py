"""A small, real FastAPI service for exercising the dashboard's proxy
against an actual upstream instead of a mock.

Run:
    uv run uvicorn main:app --reload --port 9000

Every route requires the API key below, sent as either
`Authorization: Bearer <key>` or `X-API-Key: <key>` — the dashboard's proxy
sends the upstream secret both ways, so register this key as that API's
secret and either convention works.

    GET  /anything   -> {"message": "Hasta la vista"}
    POST /anything   -> echoes back whatever JSON body was sent
"""

import os

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status

API_KEY = os.environ.get("TEST_API_KEY", "sk-test-key-12345")

app = FastAPI(title="Test APIs")


def require_api_key(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    bearer = authorization.removeprefix("Bearer ").strip() if authorization else None
    if API_KEY not in (bearer, x_api_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing API key")


@app.get("/{path:path}", dependencies=[Depends(require_api_key)])
async def get_handler(path: str):
    return {"message": "Hasta la vista"}


@app.post("/{path:path}", dependencies=[Depends(require_api_key)])
async def post_handler(path: str, request: Request):
    body = await request.body()
    try:
        parsed = await request.json() if body else {}
    except ValueError:
        parsed = {"raw": body.decode(errors="replace")}
    return {"body": parsed, "api_key": API_KEY}
