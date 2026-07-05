"""Grant/role changes must take effect immediately at the proxy — mirrors
test_cache_invalidation.py's guarantee for revoke/disable/rotate, extended to
grants, member removal, and admin->member demotion."""

from tests.conftest import (
    add_member_directly,
    create_api,
    create_token,
    create_team,
    signup,
    team_headers,
    whoami,
)
from tests.test_proxy import proxied  # fixture: client with mock upstream  # noqa: F401


def _proxy_get(client, raw_token):
    return client.get(
        "/proxy/v1/models", headers={"Authorization": f"Bearer {raw_token}"}
    )


def _team_with_granted_member(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    api = create_api(client, team_headers(owner_headers, team["id"]))
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")
    admin_ctx = team_headers(owner_headers, team["id"])
    member_ctx = team_headers(member_headers, team["id"])
    client.post(f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx)
    token = create_token(client, member_ctx, api["id"])
    return owner_headers, team, api, member_headers, member_id, token["token"]


def test_revoking_grant_denies_at_proxy_immediately(proxied):
    _owner, team, api, _mh, member_id, token = _team_with_granted_member(proxied)
    admin_ctx = team_headers(_owner, team["id"])

    assert _proxy_get(proxied, token).status_code == 200  # now cached

    proxied.delete(f"/apis/{api['id']}/grants/{member_id}", headers=admin_ctx)
    assert _proxy_get(proxied, token).status_code == 403


def test_regranting_restores_the_same_token(proxied):
    """Confirms tokens are kept (not hard-revoked) — re-granting must work
    without the member creating a new token."""
    _owner, team, api, _mh, member_id, token = _team_with_granted_member(proxied)
    admin_ctx = team_headers(_owner, team["id"])

    proxied.delete(f"/apis/{api['id']}/grants/{member_id}", headers=admin_ctx)
    assert _proxy_get(proxied, token).status_code == 403

    proxied.post(
        f"/apis/{api['id']}/grants", json={"user_id": member_id}, headers=admin_ctx
    )
    assert _proxy_get(proxied, token).status_code == 200


def test_removing_member_denies_at_proxy_immediately(proxied):
    _owner, team, api, _mh, member_id, token = _team_with_granted_member(proxied)
    admin_ctx = team_headers(_owner, team["id"])

    assert _proxy_get(proxied, token).status_code == 200  # now cached

    proxied.delete(f"/teams/{team['id']}/members/{member_id}", headers=_owner)
    assert _proxy_get(proxied, token).status_code == 403


def test_demoting_admin_to_member_denies_implicit_access_immediately(proxied):
    owner_headers = signup(proxied, "owner@x.com")
    team = create_team(proxied, owner_headers)
    api = create_api(proxied, team_headers(owner_headers, team["id"]))
    admin_headers = signup(proxied, "admin@x.com")
    admin_id = whoami(proxied, admin_headers)["id"]
    add_member_directly(team["id"], admin_id, "admin")

    admin_ctx = team_headers(admin_headers, team["id"])
    token = create_token(proxied, admin_ctx, api["id"])
    assert _proxy_get(proxied, token["token"]).status_code == 200  # now cached

    # demote to member — no grant exists, so implicit admin access must vanish
    proxied.patch(
        f"/teams/{team['id']}/members/{admin_id}",
        json={"role": "member"},
        headers=owner_headers,
    )
    assert _proxy_get(proxied, token["token"]).status_code == 403

    # granting access restores it
    proxied.post(
        f"/apis/{api['id']}/grants",
        json={"user_id": admin_id},
        headers=team_headers(owner_headers, team["id"]),
    )
    assert _proxy_get(proxied, token["token"]).status_code == 200
