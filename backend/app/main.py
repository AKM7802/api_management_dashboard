"""FastAPI app wiring: routers, lifespan (DB init, usage writer, HTTP client)."""

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import apis, auth, proxy, tokens, usage
from app.config import get_settings
from app.db.postgres import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db()
    app.state.usage = usage.build_recorder()
    app.state.usage.start()
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.upstream_timeout_seconds, connect=10.0),
        follow_redirects=False,
    )
    app.state.token_cache = {}
    try:
        yield
    finally:
        await app.state.http_client.aclose()
        await app.state.usage.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="API Management Backend", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(apis.router)
    app.include_router(tokens.router)
    app.include_router(usage.router)
    app.include_router(proxy.router)

    @app.get("/health", tags=["health"])
    def health():
        return {"status": "ok"}

    return app


app = create_app()
