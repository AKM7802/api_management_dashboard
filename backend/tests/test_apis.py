import httpx
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

from tests.conftest import (
    add_member_directly,
    create_api,
    create_team,
    create_token,
    signup,
    team_headers,
    whoami,
)


def build_hasta_la_vista_mock_api() -> FastAPI:
    """The simplest possible upstream: whatever the request, the reply never
    changes. A stable stand-in for a real (and sometimes flaky) third-party
    API when a test only needs the proxy round trip to work, not any
    particular upstream behavior."""
    upstream = FastAPI()

    @upstream.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def hasta_la_vista(path: str):
        return PlainTextResponse("Hasta la vista, baby.")

    return upstream


def test_proxy_against_hasta_la_vista_mock_api(client):
    """A do-nothing test API + token: proxied calls always get the same
    canned reply back, regardless of path or method."""
    headers = signup(client)
    api = create_api(client, headers, name="Hasta La Vista Test API")
    token = create_token(client, headers, api["id"])

    client.app.state.http_client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=build_hasta_la_vista_mock_api()),
        base_url="http://upstream",
    )

    r = client.post(
        "/proxy/anything/at/all",
        json={"doesnt": "matter"},
        headers={"Authorization": f"Bearer {token['token']}"},
    )
    assert r.status_code == 200
    assert r.text == "Hasta la vista, baby."


def test_create_api_returns_a_working_token(client):
    """No separate trip to the Access Tokens tab needed — the creator gets a
    usable token in the same response, and it actually works through the
    proxy immediately."""
    headers = signup(client)
    api = create_api(client, headers)

    assert api["token"]["token"].startswith("xpxy_live_")
    assert api["token"]["name"] == "default"

    client.app.state.http_client = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=build_hasta_la_vista_mock_api()),
        base_url="http://upstream",
    )
    r = client.get(
        "/proxy/ping", headers={"Authorization": f"Bearer {api['token']['token']}"}
    )
    assert r.status_code == 200

    # and it shows up in the token list like any other token would
    listed = client.get(f"/apis/{api['id']}/tokens", headers=headers).json()
    assert [t["name"] for t in listed] == ["default"]


def test_personal_api_always_shows_base_url_and_key(client):
    """No team involved -> the caller is always the sole owner, so nothing
    is redacted (this is the flow that predates teams entirely)."""
    headers = signup(client)
    api = create_api(client, headers, base_url="https://api.example.com")
    assert api["base_url"] == "https://api.example.com"
    assert api["secret_last4"]

    fetched = client.get(f"/apis/{api['id']}", headers=headers).json()
    assert fetched["base_url"] == "https://api.example.com"
    assert fetched["secret_last4"]


def test_team_member_never_sees_base_url_or_key(client):
    """A granted member can see and use the API (name, status, its own
    token) but never the upstream address or key — those stay admin-only."""
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    admin_ctx = team_headers(owner_headers, team["id"])
    api = create_api(client, admin_ctx, base_url="https://api.example.com")

    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")
    member_ctx = team_headers(member_headers, team["id"])
    client.post(f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)

    fetched = client.get(f"/apis/{api['id']}", headers=member_ctx).json()
    assert fetched["base_url"] is None
    assert fetched["secret_last4"] is None
    assert fetched["name"] == api["name"]  # everything else still visible

    listed = client.get("/apis", headers=member_ctx).json()
    assert listed[0]["base_url"] is None
    assert listed[0]["secret_last4"] is None

    # the admin's own view is never redacted
    admin_view = client.get(f"/apis/{api['id']}", headers=admin_ctx).json()
    assert admin_view["base_url"] == "https://api.example.com"


def test_create_and_list_api(client):
    headers = signup(client)
    api = create_api(client, headers, secret="sk-abcd1234")

    assert api["secret_last4"] == "1234"
    assert "secret" not in api and "encrypted_secret" not in api
    assert api["status"] == "active"

    r = client.get("/apis", headers=headers)
    assert r.status_code == 200
    assert [a["id"] for a in r.json()] == [api["id"]]


def test_duplicate_personal_api_name_rejected(client):
    headers = signup(client)
    create_api(client, headers, name="My API")

    r = client.post(
        "/apis",
        json={"name": "My API", "base_url": "https://other.example.com", "secret": "sk-2"},
        headers=headers,
    )
    assert r.status_code == 409
    assert "My API" in r.json()["detail"]


def test_same_name_allowed_for_different_users(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    create_api(client, headers_a, name="Shared Name")

    r = client.post(
        "/apis",
        json={"name": "Shared Name", "base_url": "https://b.example.com", "secret": "sk-b"},
        headers=headers_b,
    )
    assert r.status_code == 201


def test_duplicate_team_api_name_rejected(client):
    owner_headers = signup(client)
    team = create_team(client, owner_headers)
    admin_ctx = team_headers(owner_headers, team["id"])
    create_api(client, admin_ctx, name="Team API")

    r = client.post(
        "/apis",
        json={"name": "Team API", "base_url": "https://other.example.com", "secret": "sk-2"},
        headers=admin_ctx,
    )
    assert r.status_code == 409


def test_rename_to_existing_name_rejected(client):
    headers = signup(client)
    create_api(client, headers, name="First")
    second = create_api(client, headers, name="Second")

    r = client.patch(f"/apis/{second['id']}", json={"name": "First"}, headers=headers)
    assert r.status_code == 409

    # unchanged
    assert client.get(f"/apis/{second['id']}", headers=headers).json()["name"] == "Second"


def test_rename_to_its_own_current_name_is_a_noop(client):
    headers = signup(client)
    api = create_api(client, headers, name="Same Name")

    r = client.patch(
        f"/apis/{api['id']}",
        json={"name": "Same Name", "status": "disabled"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "disabled"


def test_update_api_and_rotate_secret(client):
    headers = signup(client)
    api = create_api(client, headers)

    r = client.patch(
        f"/apis/{api['id']}",
        json={
            "name": "renamed",
            "status": "disabled",
            "base_url": "https://new-upstream.example.com/",
            "secret": "sk-new-secret-key-5678",
        },
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "renamed"
    assert body["status"] == "disabled"
    assert body["base_url"] == "https://new-upstream.example.com"  # trailing slash stripped
    assert body["secret_last4"] == "5678"


def test_delete_api(client):
    headers = signup(client)
    api = create_api(client, headers)
    assert client.delete(f"/apis/{api['id']}", headers=headers).status_code == 204
    assert client.get(f"/apis/{api['id']}", headers=headers).status_code == 404


def test_user_isolation(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    api = create_api(client, headers_a)

    # user B can't see, edit, or delete A's API
    assert client.get(f"/apis/{api['id']}", headers=headers_b).status_code == 404
    assert (
        client.patch(f"/apis/{api['id']}", json={"name": "x"}, headers=headers_b).status_code
        == 404
    )
    assert client.delete(f"/apis/{api['id']}", headers=headers_b).status_code == 404
    assert client.get("/apis", headers=headers_b).json() == []


def test_apis_require_auth(client):
    assert client.get("/apis").status_code == 401
