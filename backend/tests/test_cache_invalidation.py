"""Regression: revoke/disable/delete must bypass the proxy's 30s token cache.

Found live: a proxied request caches the token; revoking it then returned 200
for up to the cache TTL. These tests do request → mutate → request again.
"""

from tests.conftest import create_api, create_token, signup
from tests.test_proxy import proxied  # fixture: client with mock upstream  # noqa: F401


def _proxy_get(client, raw_token):
    return client.get(
        "/proxy/v1/models", headers={"Authorization": f"Bearer {raw_token}"}
    )


def _setup(client):
    headers = signup(client)
    api = create_api(client, headers)
    token = create_token(client, headers, api["id"])
    return headers, api, token


def test_revoked_token_rejected_immediately(proxied):  # noqa: F811
    headers, api, token = _setup(proxied)
    assert _proxy_get(proxied, token["token"]).status_code == 200  # now cached

    proxied.delete(f"/tokens/{token['id']}", headers=headers)
    assert _proxy_get(proxied, token["token"]).status_code == 401


def test_disabled_api_rejected_immediately(proxied):  # noqa: F811
    headers, api, token = _setup(proxied)
    assert _proxy_get(proxied, token["token"]).status_code == 200  # now cached

    proxied.patch(f"/apis/{api['id']}", json={"status": "disabled"}, headers=headers)
    assert _proxy_get(proxied, token["token"]).status_code == 403

    # re-enabling works again (cache invalidated both ways)
    proxied.patch(f"/apis/{api['id']}", json={"status": "active"}, headers=headers)
    assert _proxy_get(proxied, token["token"]).status_code == 200


def test_deleted_api_rejected_immediately(proxied):  # noqa: F811
    headers, api, token = _setup(proxied)
    assert _proxy_get(proxied, token["token"]).status_code == 200  # now cached

    proxied.delete(f"/apis/{api['id']}", headers=headers)
    assert _proxy_get(proxied, token["token"]).status_code == 401


def test_rotated_secret_used_immediately(proxied):  # noqa: F811
    headers, api, token = _setup(proxied)
    assert _proxy_get(proxied, token["token"]).status_code == 200  # now cached

    proxied.patch(
        f"/apis/{api['id']}",
        json={"secret": "sk-rotated-secret-xyz1"},
        headers=headers,
    )
    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {token['token']}"},
    )
    assert r.status_code == 200
    # the upstream must see the NEW key, not the cached old one
    assert r.headers["x-echo-authorization"] == "Bearer sk-rotated-secret-xyz1"
