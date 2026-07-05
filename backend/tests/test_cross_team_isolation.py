"""Team A must never reach team B's APIs/tokens/grants/usage, and a team API
must be invisible outside its own team context (including Personal mode)."""

from tests.conftest import create_api, create_team, signup, team_headers


def test_team_a_cannot_access_team_bs_api(client):
    headers_a = signup(client, "a@x.com")
    team_a = create_team(client, headers_a)

    headers_b = signup(client, "b@x.com")
    team_b = create_team(client, headers_b)
    api_b = create_api(client, team_headers(headers_b, team_b["id"]))

    # A is not a member of B — spoofing X-Team-Id for B is rejected outright
    assert (
        client.get(f"/apis/{api_b['id']}", headers=team_headers(headers_a, team_b["id"]))
        .status_code
        == 404
    )
    # even switched into their OWN team, A still can't reach B's credential id
    assert (
        client.get(f"/apis/{api_b['id']}", headers=team_headers(headers_a, team_a["id"]))
        .status_code
        == 404
    )


def test_spoofing_x_team_id_to_non_member_team_rejected(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    team_b = create_team(client, headers_b)

    r = client.get("/apis", headers=team_headers(headers_a, team_b["id"]))
    assert r.status_code == 404


def test_team_api_invisible_in_personal_mode(client):
    headers = signup(client)
    team = create_team(client, headers)
    api = create_api(client, team_headers(headers, team["id"]))

    # no X-Team-Id -> Personal mode; the team API doesn't show up
    assert api["id"] not in [a["id"] for a in client.get("/apis", headers=headers).json()]
    assert client.get(f"/apis/{api['id']}", headers=headers).status_code == 404


def test_personal_api_invisible_in_team_mode(client):
    headers = signup(client)
    personal_api = create_api(client, headers)
    team = create_team(client, headers)

    team_ctx = team_headers(headers, team["id"])
    assert personal_api["id"] not in [a["id"] for a in client.get("/apis", headers=team_ctx).json()]
    assert client.get(f"/apis/{personal_api['id']}", headers=team_ctx).status_code == 404


def test_team_bs_tokens_and_grants_unreachable_from_team_a(client):
    headers_a = signup(client, "a@x.com")
    team_a = create_team(client, headers_a)

    headers_b = signup(client, "b@x.com")
    team_b = create_team(client, headers_b)
    api_b = create_api(client, team_headers(headers_b, team_b["id"]))

    a_in_a_ctx = team_headers(headers_a, team_a["id"])
    assert client.get(f"/apis/{api_b['id']}/tokens", headers=a_in_a_ctx).status_code == 404
    assert client.get(f"/apis/{api_b['id']}/grants", headers=a_in_a_ctx).status_code == 404
    assert (
        client.get(f"/apis/{api_b['id']}/stats/summary", headers=a_in_a_ctx).status_code
        == 404
    )


def test_team_members_list_not_visible_to_non_member(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    team_b = create_team(client, headers_b)

    assert client.get(f"/teams/{team_b['id']}/members", headers=headers_a).status_code == 404
