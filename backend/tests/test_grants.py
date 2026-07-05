"""Per-person API access grants: without a grant a member is denied; with one
they can mint/use tokens and see only their own usage, never a teammate's."""

from tests.conftest import (
    add_member_directly,
    create_api,
    create_token,
    create_team,
    signup,
    team_headers,
    wait_for_logs,
    whoami,
)
from tests.test_proxy import proxied  # fixture: client with mock upstream  # noqa: F401


def _team_with_api_and_member(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    api = create_api(client, team_headers(owner_headers, team["id"]))
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")
    return owner_headers, team, api, member_headers, member_id


def test_grants_endpoints_are_admin_only(client):
    owner_headers, team, api, member_headers, member_id = _team_with_api_and_member(
        client
    )
    member_ctx = team_headers(member_headers, team["id"])
    assert client.get(f"/apis/{api['id']}/grants", headers=member_ctx).status_code == 403
    r = client.post(
        f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=member_ctx
    )
    assert r.status_code == 403


def test_member_without_grant_cannot_create_token(client):
    owner_headers, team, api, member_headers, member_id = _team_with_api_and_member(
        client
    )
    r = client.post(
        f"/apis/{api['id']}/tokens",
        json={"name": "x"},
        headers=team_headers(member_headers, team["id"]),
    )
    assert r.status_code == 403


def test_grant_then_member_can_mint_and_use_token(proxied):
    owner_headers, team, api, member_headers, member_id = _team_with_api_and_member(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])

    r = proxied.post(
        f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx
    )
    assert r.status_code == 201

    token = create_token(proxied, member_ctx, api["id"])
    r = proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {token['token']}"},
    )
    assert r.status_code == 200


def test_member_sees_only_own_usage_not_teammates(proxied):
    owner_headers, team, api, member_headers, member_id = _team_with_api_and_member(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])
    proxied.post(f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)

    # admin's own token generates traffic
    admin_token = create_token(proxied, admin_ctx, api["id"], name="admin token")
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {admin_token['token']}"},
    )
    # member's own token generates traffic
    member_token = create_token(proxied, member_ctx, api["id"], name="member token")
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {member_token['token']}"},
    )

    wait_for_logs(proxied, admin_ctx, api["id"], n=2)  # both rows landed

    member_summary = proxied.get(
        f"/apis/{api['id']}/stats/summary", headers=member_ctx
    ).json()
    assert member_summary["requests"] == 1  # only their own request

    admin_summary = proxied.get(
        f"/apis/{api['id']}/stats/summary", headers=admin_ctx
    ).json()
    assert admin_summary["requests"] == 2  # team-wide, both requests


def test_member_token_list_excludes_admin_tokens(client):
    owner_headers, team, api, member_headers, member_id = _team_with_api_and_member(
        client
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])
    client.post(f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)

    create_token(client, admin_ctx, api["id"], name="admin token")
    create_token(client, member_ctx, api["id"], name="member token")

    member_tokens = client.get(f"/apis/{api['id']}/tokens", headers=member_ctx).json()
    assert [t["name"] for t in member_tokens] == ["member token"]

    admin_tokens = client.get(f"/apis/{api['id']}/tokens", headers=admin_ctx).json()
    assert {t["name"] for t in admin_tokens} == {"admin token", "member token"}


def test_revoking_grant_removes_api_from_members_list(client):
    owner_headers, team, api, member_headers, member_id = _team_with_api_and_member(
        client
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])
    client.post(f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)
    assert len(client.get("/apis", headers=member_ctx).json()) == 1

    client.delete(f"/apis/{api['id']}/grants/{member_id}", headers=admin_ctx)
    assert client.get("/apis", headers=member_ctx).json() == []
