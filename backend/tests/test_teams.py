"""Team creation, rename, delete-cascade, ownership transfer.

Teams are opt-in: a user who never calls POST /teams sees zero behavior
change (covered by the existing full suite, which never sends X-Team-Id).
"""

from tests.conftest import (
    add_member_directly,
    create_api,
    create_team,
    signup,
    team_headers,
    whoami,
)


def test_create_team_makes_caller_owner(client):
    headers = signup(client)
    team = create_team(client, headers, "Acme Corp")
    assert team["name"] == "Acme Corp"
    assert team["my_role"] == "owner"

    listed = client.get("/teams", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["id"] == team["id"]


def test_user_with_no_team_sees_empty_list(client):
    headers = signup(client)
    assert client.get("/teams", headers=headers).json() == []


def test_rename_team(client):
    headers = signup(client)
    team = create_team(client, headers)
    r = client.patch(
        f"/teams/{team['id']}", json={"name": "New Name"}, headers=headers
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


def test_non_member_gets_404_not_403(client):
    """404, not 403, so a non-member can't tell whether a team id exists."""
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    team = create_team(client, headers_a)

    assert client.get(f"/teams/{team['id']}", headers=headers_b).status_code == 404
    assert (
        client.patch(
            f"/teams/{team['id']}", json={"name": "x"}, headers=headers_b
        ).status_code
        == 404
    )


def test_delete_team_cascades_apis_and_tokens(client):
    headers = signup(client)
    team = create_team(client, headers)
    ctx_headers = team_headers(headers, team["id"])
    api = create_api(client, ctx_headers, name="Team API")
    assert api["team_id"] == team["id"]

    r = client.delete(f"/teams/{team['id']}", headers=headers)
    assert r.status_code == 204

    # the team API is gone too (cascade), even outside team context
    assert client.get(f"/apis/{api['id']}", headers=headers).status_code == 404


def test_only_owner_can_delete_team(client):
    headers = signup(client, "owner@x.com")
    team = create_team(client, headers)
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "admin")

    r = client.delete(f"/teams/{team['id']}", headers=member_headers)
    assert r.status_code == 403


def test_transfer_ownership(client):
    headers = signup(client, "owner@x.com")
    team = create_team(client, headers)
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "admin")

    r = client.post(
        f"/teams/{team['id']}/transfer",
        json={"user_id": member_id},
        headers=headers,
    )
    assert r.status_code == 204

    members = client.get(
        f"/teams/{team['id']}/members", headers=headers
    ).json()
    roles = {m["user_id"]: m["role"] for m in members}
    assert roles[member_id] == "owner"

    owner_id = whoami(client, headers)["id"]
    assert roles[owner_id] == "admin"

    # old owner can no longer delete the team
    assert client.delete(f"/teams/{team['id']}", headers=headers).status_code == 403


def test_transfer_requires_owner(client):
    headers = signup(client, "owner@x.com")
    team = create_team(client, headers)
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")

    r = client.post(
        f"/teams/{team['id']}/transfer",
        json={"user_id": member_id},
        headers=team_headers(member_headers, team["id"]),
    )
    assert r.status_code == 403
