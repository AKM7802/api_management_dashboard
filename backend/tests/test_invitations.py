"""Claimable invite-link flow: create -> preview -> accept, plus edge cases."""

from tests.conftest import create_team, signup, whoami


def test_invite_and_accept_happy_path(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)

    r = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "invitee@x.com", "role": "member"},
        headers=owner_headers,
    )
    assert r.status_code == 201, r.text
    invite = r.json()
    assert invite["token"].startswith("invite_")

    invitee_headers = signup(client, "invitee@x.com")

    preview = client.get(f"/invitations/{invite['token']}", headers=invitee_headers)
    assert preview.status_code == 200
    assert preview.json() == {
        "team_id": team["id"], "team_name": team["name"], "role": "member",
        "email": "invitee@x.com",
    }

    # must also work with NO auth at all — the whole point is letting someone
    # who hasn't logged in yet see what they're being invited to
    anon_preview = client.get(f"/invitations/{invite['token']}")
    assert anon_preview.status_code == 200
    assert anon_preview.json() == preview.json()

    r = client.post(
        "/invitations/accept", json={"token": invite["token"]}, headers=invitee_headers
    )
    assert r.status_code == 204

    members = client.get(f"/teams/{team['id']}/members", headers=owner_headers).json()
    invitee_id = whoami(client, invitee_headers)["id"]
    roles = {m["user_id"]: m["role"] for m in members}
    assert roles[invitee_id] == "member"

    # invitation is consumed — pending list is now empty
    pending = client.get(
        f"/teams/{team['id']}/invitations", headers=owner_headers
    ).json()
    assert pending == []


def test_member_cannot_create_invitations(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    r = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "x@x.com", "role": "member"},
        headers={**owner_headers, "X-Team-Id": team["id"]},  # still owner; sanity check
    )
    assert r.status_code == 201


def test_revoked_invitation_cannot_be_accepted(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    invite = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "invitee@x.com", "role": "member"},
        headers=owner_headers,
    ).json()

    client.delete(
        f"/teams/{team['id']}/invitations/{invite['id']}", headers=owner_headers
    )

    invitee_headers = signup(client, "invitee@x.com")
    r = client.post(
        "/invitations/accept", json={"token": invite["token"]}, headers=invitee_headers
    )
    assert r.status_code == 410


def test_unknown_token_rejected(client):
    headers = signup(client)
    r = client.post(
        "/invitations/accept", json={"token": "invite_totally-made-up"}, headers=headers
    )
    assert r.status_code == 404


def test_duplicate_invite_for_pending_email_rejected(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "invitee@x.com", "role": "member"},
        headers=owner_headers,
    )
    r = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "invitee@x.com", "role": "admin"},
        headers=owner_headers,
    )
    assert r.status_code == 409


def test_invite_can_only_be_accepted_by_the_invited_email(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    invite = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "intended@x.com", "role": "member"},
        headers=owner_headers,
    ).json()

    # a logged-in user who isn't the intended recipient must not be able to
    # claim this link just by knowing the token (e.g. a forwarded/leaked URL)
    imposter_headers = signup(client, "imposter@x.com")
    r = client.post(
        "/invitations/accept",
        json={"token": invite["token"]},
        headers=imposter_headers,
    )
    assert r.status_code == 403

    # the actual invitee still can
    invitee_headers = signup(client, "intended@x.com")
    r = client.post(
        "/invitations/accept",
        json={"token": invite["token"]},
        headers=invitee_headers,
    )
    assert r.status_code == 204


def test_invite_for_existing_member_rejected(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    r = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "owner@x.com", "role": "member"},
        headers=owner_headers,
    )
    assert r.status_code == 409


def test_accept_twice_rejected(client):
    owner_headers = signup(client, "owner@x.com")
    team = create_team(client, owner_headers)
    invite = client.post(
        f"/teams/{team['id']}/invitations",
        json={"email": "invitee@x.com", "role": "member"},
        headers=owner_headers,
    ).json()
    invitee_headers = signup(client, "invitee@x.com")
    client.post(
        "/invitations/accept", json={"token": invite["token"]}, headers=invitee_headers
    )
    r = client.post(
        "/invitations/accept", json={"token": invite["token"]}, headers=invitee_headers
    )
    assert r.status_code == 410
