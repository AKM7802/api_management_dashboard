"""Owner/admin can monitor each individual teammate's usage; members cannot
see anyone else's, even if they try to pass ?member_id= for someone else."""

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


def _team_two_members_one_api(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    api = create_api(client, team_headers(owner_headers, team["id"]))
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")
    admin_ctx = team_headers(owner_headers, team["id"])
    client.post(f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)
    return owner_headers, team, api, member_headers, member_id


def test_admin_sees_per_member_breakdown(proxied):
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])

    admin_token = create_token(proxied, admin_ctx, api["id"])
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {admin_token['token']}"},
    )
    member_token = create_token(proxied, member_ctx, api["id"])
    for _ in range(2):
        proxied.post(
            "/proxy/v1/chat/completions",
            json={"model": "gpt-4o", "messages": []},
            headers={"Authorization": f"Bearer {member_token['token']}"},
        )
    wait_for_logs(proxied, admin_ctx, api["id"], n=3)

    rows = proxied.get(
        f"/apis/{api['id']}/usage/by-member", headers=admin_ctx
    ).json()
    by_id = {r["user_id"]: r for r in rows}
    owner_id = whoami(proxied, owner_headers)["id"]
    assert by_id[owner_id]["requests"] == 1
    assert by_id[owner_id]["email"] == "owner@x.com"
    assert by_id[member_id]["requests"] == 2
    assert by_id[member_id]["email"] == "member@x.com"


def test_member_cannot_use_by_member_endpoints(client):
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        client
    )
    member_ctx = team_headers(member_headers, team["id"])
    assert (
        client.get(f"/apis/{api['id']}/usage/by-member", headers=member_ctx).status_code
        == 403
    )
    assert (
        client.get(f"/teams/{team['id']}/usage/summary", headers=member_headers)
        .status_code
        == 403
    )
    assert (
        client.get(f"/teams/{team['id']}/usage/by-member", headers=member_headers)
        .status_code
        == 403
    )


def test_member_id_query_param_ignored_for_non_admin(proxied):
    """A member passing ?member_id=<someone else> still only ever gets their
    own rows back — the param is only honored for admins/owners."""
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])
    owner_id = whoami(proxied, owner_headers)["id"]

    admin_token = create_token(proxied, admin_ctx, api["id"])
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {admin_token['token']}"},
    )
    wait_for_logs(proxied, admin_ctx, api["id"], n=1)

    r = proxied.get(
        f"/apis/{api['id']}/stats/summary?member_id={owner_id}", headers=member_ctx
    )
    assert r.json()["requests"] == 0  # member's own traffic, not the owner's


def test_admin_member_id_drilldown_works(proxied):
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])

    member_token = create_token(proxied, member_ctx, api["id"])
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {member_token['token']}"},
    )
    wait_for_logs(proxied, admin_ctx, api["id"], n=1)

    r = proxied.get(
        f"/apis/{api['id']}/stats/summary?member_id={member_id}", headers=admin_ctx
    )
    assert r.json()["requests"] == 1


def test_by_member_rejected_for_personal_api(client):
    headers = signup(client)
    api = create_api(client, headers)
    r = client.get(f"/apis/{api['id']}/usage/by-member", headers=headers)
    assert r.status_code == 400


def test_by_member_series_has_correct_buckets_and_emails(proxied):
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])

    admin_token = create_token(proxied, admin_ctx, api["id"])
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {admin_token['token']}"},
    )
    member_token = create_token(proxied, member_ctx, api["id"])
    for _ in range(2):
        proxied.post(
            "/proxy/v1/chat/completions",
            json={"model": "gpt-4o", "messages": []},
            headers={"Authorization": f"Bearer {member_token['token']}"},
        )
    wait_for_logs(proxied, admin_ctx, api["id"], n=3)

    rows = proxied.get(
        f"/teams/{team['id']}/usage/by-member/series?range=7d&interval=day",
        headers=admin_ctx,
    ).json()
    owner_id = whoami(proxied, owner_headers)["id"]
    by_user = {r["user_id"]: r for r in rows}

    # every row here is today's single bucket -- one row per member, not per
    # request, since stats_by_member groups by (user_id, bucket)
    assert by_user[owner_id]["requests"] == 1
    assert by_user[owner_id]["email"] == "owner@x.com"
    assert by_user[member_id]["requests"] == 2
    assert by_user[member_id]["email"] == "member@x.com"
    assert all("bucket" in r for r in rows)


def test_by_member_series_rejected_for_member(client):
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        client
    )
    r = client.get(
        f"/teams/{team['id']}/usage/by-member/series", headers=member_headers
    )
    assert r.status_code == 403


def test_team_wide_summary_aggregates_across_apis(proxied):
    owner_headers, team, api, member_headers, member_id = _team_two_members_one_api(
        proxied
    )
    admin_ctx = team_headers(owner_headers, team["id"])
    api2 = create_api(proxied, admin_ctx, name="Second API")
    token1 = create_token(proxied, admin_ctx, api["id"])
    token2 = create_token(proxied, admin_ctx, api2["id"])
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {token1['token']}"},
    )
    proxied.post(
        "/proxy/v1/chat/completions",
        json={"model": "gpt-4o", "messages": []},
        headers={"Authorization": f"Bearer {token2['token']}"},
    )
    wait_for_logs(proxied, admin_ctx, api["id"], n=1)
    wait_for_logs(proxied, admin_ctx, api2["id"], n=1)

    summary = proxied.get(f"/teams/{team['id']}/usage/summary", headers=owner_headers).json()
    assert summary["requests"] == 2
