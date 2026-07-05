"""The role capability matrix for team APIs (owner/admin/member)."""

from tests.conftest import (
    add_member_directly,
    create_api,
    create_team,
    signup,
    team_headers,
    whoami,
)


def _team_with_member(client, role: str):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, role)
    return owner_headers, team, member_headers, member_id


def test_member_cannot_create_team_api(client):
    _owner, team, member_headers, _mid = _team_with_member(client, "member")
    r = client.post(
        "/apis",
        json={"name": "x", "base_url": "http://x", "secret": "sk-x"},
        headers=team_headers(member_headers, team["id"]),
    )
    assert r.status_code == 403


def test_admin_can_create_team_api(client):
    _owner, team, admin_headers, _mid = _team_with_member(client, "admin")
    api = create_api(client, team_headers(admin_headers, team["id"]))
    assert api["team_id"] == team["id"]


def test_member_cannot_configure_or_delete_team_api(client):
    owner_headers, team, member_headers, _mid = _team_with_member(client, "member")
    api = create_api(client, team_headers(owner_headers, team["id"]))

    member_ctx = team_headers(member_headers, team["id"])
    assert (
        client.patch(
            f"/apis/{api['id']}", json={"name": "y"}, headers=member_ctx
        ).status_code
        == 403
    )
    assert client.delete(f"/apis/{api['id']}", headers=member_ctx).status_code == 403


def test_member_apis_list_only_shows_granted(client):
    """Before any grant exists, a member's /apis list is empty even though
    the team has an API — full grant-enforcement lands in Phase 3, but the
    list-filtering behavior is already active from Phase 1."""
    owner_headers, team, member_headers, _mid = _team_with_member(client, "member")
    create_api(client, team_headers(owner_headers, team["id"]))

    member_ctx = team_headers(member_headers, team["id"])
    assert client.get("/apis", headers=member_ctx).json() == []

    admin_ctx = team_headers(owner_headers, team["id"])
    assert len(client.get("/apis", headers=admin_ctx).json()) == 1


def test_only_owner_manages_admin_roles(client):
    owner_headers, team, admin_headers, admin_id = _team_with_member(client, "admin")
    other_member_headers = signup(client, "other@x.com")
    other_id = whoami(client, other_member_headers)["id"]
    add_member_directly(team["id"], other_id, "member")

    # an admin cannot demote another admin
    r = client.patch(
        f"/teams/{team['id']}/members/{admin_id}",
        json={"role": "member"},
        headers=admin_headers,
    )
    assert r.status_code == 403

    # but an admin CAN promote a plain member
    r = client.patch(
        f"/teams/{team['id']}/members/{other_id}",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["role"] == "admin"

    # the owner can demote an admin
    r = client.patch(
        f"/teams/{team['id']}/members/{admin_id}",
        json={"role": "member"},
        headers=owner_headers,
    )
    assert r.status_code == 200


def test_admin_cannot_remove_another_admin(client):
    owner_headers, team, admin_headers, admin_id = _team_with_member(client, "admin")
    other_admin_headers = signup(client, "other-admin@x.com")
    other_admin_id = whoami(client, other_admin_headers)["id"]
    add_member_directly(team["id"], other_admin_id, "admin")

    r = client.delete(
        f"/teams/{team['id']}/members/{other_admin_id}", headers=admin_headers
    )
    assert r.status_code == 403

    # owner can
    r = client.delete(
        f"/teams/{team['id']}/members/{other_admin_id}", headers=owner_headers
    )
    assert r.status_code == 204


def test_owner_role_is_protected_from_role_update_and_removal(client):
    owner_headers, team, admin_headers, _aid = _team_with_member(client, "admin")
    owner_id = whoami(client, owner_headers)["id"]

    r = client.patch(
        f"/teams/{team['id']}/members/{owner_id}",
        json={"role": "member"},
        headers=admin_headers,
    )
    assert r.status_code == 400

    r = client.delete(f"/teams/{team['id']}/members/{owner_id}", headers=admin_headers)
    assert r.status_code == 400
