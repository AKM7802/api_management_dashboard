"""The per-member access + usage view: GET /teams/{id}/members/{id}/access --
every team API, whether this specific member can use it, and how much they
actually have. The single admin/owner surface for "who can use what"."""

from tests.conftest import (
    add_member_directly,
    create_api,
    create_team,
    create_token,
    signup,
    team_headers,
    wait_for_logs,
    whoami,
)
from tests.test_proxy import proxied  # fixture: client with mock upstream  # noqa: F401


def _team_with_two_apis_and_member(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    admin_ctx = team_headers(owner_headers, team["id"])
    api_a = create_api(client, admin_ctx, name="API A")
    api_b = create_api(client, admin_ctx, name="API B")
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")
    return owner_headers, team, api_a, api_b, member_headers, member_id


def test_member_only_shown_granted_where_actually_granted(client):
    owner_headers, team, api_a, api_b, member_headers, member_id = (
        _team_with_two_apis_and_member(client)
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    client.post(f"/apis/{api_a['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)

    rows = client.get(
        f"/teams/{team['id']}/members/{member_id}/access", headers=owner_headers
    ).json()
    assert len(rows) == 2
    by_name = {r["name"]: r for r in rows}
    assert by_name["API A"]["granted"] is True
    assert by_name["API A"]["implicit"] is False
    assert by_name["API B"]["granted"] is False
    assert by_name["API B"]["implicit"] is False


def test_admin_shows_implicit_access_to_everything(client):
    owner_headers, team, api_a, api_b, member_headers, member_id = (
        _team_with_two_apis_and_member(client)
    )
    client.patch(
        f"/teams/{team['id']}/members/{member_id}",
        json={"role": "admin"},
        headers=owner_headers,
    )

    rows = client.get(
        f"/teams/{team['id']}/members/{member_id}/access", headers=owner_headers
    ).json()
    assert all(r["granted"] and r["implicit"] for r in rows)


def test_member_cannot_view_this_endpoint(client):
    owner_headers, team, api_a, api_b, member_headers, member_id = (
        _team_with_two_apis_and_member(client)
    )
    r = client.get(
        f"/teams/{team['id']}/members/{member_id}/access", headers=member_headers
    )
    assert r.status_code == 403


def test_unknown_member_id_404s(client):
    owner_headers, team, api_a, api_b, member_headers, member_id = (
        _team_with_two_apis_and_member(client)
    )
    r = client.get(
        f"/teams/{team['id']}/members/not-a-real-user-id/access", headers=owner_headers
    )
    assert r.status_code == 404


def test_usage_reflects_real_per_api_activity(proxied):
    owner_headers, team, api_a, api_b, member_headers, member_id = (
        _team_with_two_apis_and_member(proxied)
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    proxied.post(f"/apis/{api_a['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)
    proxied.post(f"/apis/{api_b['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)

    member_ctx = team_headers(member_headers, team["id"])
    token_a = create_token(proxied, member_ctx, api_a["id"])
    token_b = create_token(proxied, member_ctx, api_b["id"])

    for _ in range(3):
        proxied.post(
            "/proxy/v1/chat/completions",
            json={"model": "gpt-4o", "messages": []},
            headers={"Authorization": f"Bearer {token_a['token']}"},
        )
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {token_b['token']}"},
    )
    wait_for_logs(proxied, admin_ctx, api_a["id"], n=3)
    wait_for_logs(proxied, admin_ctx, api_b["id"], n=1)

    rows = proxied.get(
        f"/teams/{team['id']}/members/{member_id}/access", headers=owner_headers
    ).json()
    by_name = {r["name"]: r for r in rows}
    assert by_name["API A"]["requests"] == 3
    assert by_name["API B"]["requests"] == 1
    assert by_name["API A"]["granted"] is True
    assert by_name["API B"]["granted"] is True


def test_ungranted_api_shows_zero_usage_and_not_granted(client):
    owner_headers, team, api_a, api_b, member_headers, member_id = (
        _team_with_two_apis_and_member(client)
    )
    rows = client.get(
        f"/teams/{team['id']}/members/{member_id}/access", headers=owner_headers
    ).json()
    assert all(not r["granted"] and r["requests"] == 0 for r in rows)
