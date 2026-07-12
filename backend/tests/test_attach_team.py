"""Attaching an existing personal API to a team: owner/admin only, one-way,
keeps the credential's tokens/history intact, and takes effect immediately."""

from tests.conftest import (
    add_member_directly,
    create_api,
    create_team,
    create_token,
    signup,
    team_headers,
    whoami,
)
from tests.test_proxy import proxied  # fixture: client with mock upstream  # noqa: F401


def test_owner_can_attach_own_personal_api_to_team(client):
    headers = signup(client)
    api = create_api(client, headers)
    team = create_team(client, headers)

    r = client.post(
        f"/apis/{api['id']}/attach-team", json={"team_id": team["id"]}, headers=headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["team_id"] == team["id"]

    # now visible in team context, gone from personal
    assert client.get("/apis", headers=headers).json() == []
    team_apis = client.get("/apis", headers=team_headers(headers, team["id"])).json()
    assert [a["id"] for a in team_apis] == [api["id"]]


def test_admin_can_attach_own_personal_api_to_team(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    admin_headers = signup(client, "admin@x.com")
    admin_id = whoami(client, admin_headers)["id"]
    add_member_directly(team["id"], admin_id, "admin")

    api = create_api(client, admin_headers)
    r = client.post(
        f"/apis/{api['id']}/attach-team",
        json={"team_id": team["id"]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text


def test_member_cannot_attach_api_to_team(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    member_headers = signup(client, "member@x.com")
    member_id = whoami(client, member_headers)["id"]
    add_member_directly(team["id"], member_id, "member")

    api = create_api(client, member_headers)
    r = client.post(
        f"/apis/{api['id']}/attach-team",
        json={"team_id": team["id"]},
        headers=member_headers,
    )
    assert r.status_code == 403


def test_cannot_attach_someone_elses_personal_api(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    other_headers = signup(client, "other@x.com")
    other_api = create_api(client, other_headers)

    r = client.post(
        f"/apis/{other_api['id']}/attach-team",
        json={"team_id": team["id"]},
        headers=owner_headers,
    )
    assert r.status_code == 404


def test_cannot_attach_api_already_in_a_team(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    team_api = create_api(client, team_headers(owner_headers, team["id"]))

    r = client.post(
        f"/apis/{team_api['id']}/attach-team",
        json={"team_id": team["id"]},
        headers=owner_headers,
    )
    assert r.status_code == 404  # not owned in personal mode (team_id is set)


def test_cannot_attach_api_with_name_already_used_in_team(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    create_api(client, team_headers(owner_headers, team["id"]), name="Same Name")
    personal_api = create_api(client, owner_headers, name="Same Name")

    r = client.post(
        f"/apis/{personal_api['id']}/attach-team",
        json={"team_id": team["id"]},
        headers=owner_headers,
    )
    assert r.status_code == 409
    # stays personal, not partially attached
    assert client.get(f"/apis/{personal_api['id']}", headers=owner_headers).json()["team_id"] is None


def test_cannot_attach_to_a_team_youre_not_a_member_of(client):
    owner_headers = signup(client, "owner@x.com")
    api = create_api(client, owner_headers)
    other_headers = signup(client, "other@x.com")
    other_team = create_team(client, other_headers)

    r = client.post(
        f"/apis/{api['id']}/attach-team",
        json={"team_id": other_team["id"]},
        headers=owner_headers,
    )
    assert r.status_code == 404


def test_attach_takes_effect_immediately_for_existing_token(proxied):
    headers = signup(proxied)
    api = create_api(proxied, headers)
    token = create_token(proxied, headers, api["id"])
    team = create_team(proxied, headers)

    # cache the token's (personal) resolution
    r = proxied.get(
        "/proxy/v1/models", headers={"Authorization": f"Bearer {token['token']}"}
    )
    assert r.status_code == 200

    proxied.post(
        f"/apis/{api['id']}/attach-team", json={"team_id": team["id"]}, headers=headers
    )

    # owner's existing token keeps working (implicit owner access), not
    # stuck on a stale personal-mode cache entry
    r = proxied.get(
        "/proxy/v1/models", headers={"Authorization": f"Bearer {token['token']}"}
    )
    assert r.status_code == 200
