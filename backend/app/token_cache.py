"""Invalidation for the proxy's in-process token cache.

Lives in its own module (no app-internal imports) so both the proxy and the
management routers can use it without import cycles. Works because the backend
runs as a single process (see docs/plans/README.md).
"""


def invalidate_token(app, token_hash: str) -> None:
    """Drop one token from the proxy cache (call on revoke)."""
    app.state.token_cache.pop(token_hash, None)


def invalidate_credential(app, credential_id: str) -> None:
    """Drop every cached token of a credential (call on disable/rotate/delete)."""
    cache = app.state.token_cache
    for key in [k for k, v in cache.items() if v.credential_id == credential_id]:
        cache.pop(key, None)
