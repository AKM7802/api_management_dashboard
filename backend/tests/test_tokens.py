from tests.conftest import create_api, create_token, signup


def test_create_token_shows_raw_once(client):
    headers = signup(client)
    api = create_api(client, headers)

    created = create_token(client, headers, api["id"])
    assert created["token"].startswith("xpxy_live_")
    assert created["token_prefix"] == created["token"][:14]

    # listing never exposes the raw token — API creation also auto-mints a
    # "default" token for the creator, so two rows are expected here
    r = client.get(f"/apis/{api['id']}/tokens", headers=headers)
    assert r.status_code == 200
    listed = r.json()
    assert len(listed) == 2
    by_prefix = {t["token_prefix"]: t for t in listed}
    assert created["token_prefix"] in by_prefix
    assert "token" not in by_prefix[created["token_prefix"]]


def test_revoke_token(client):
    headers = signup(client)
    api = create_api(client, headers)
    created = create_token(client, headers, api["id"])

    assert client.delete(f"/tokens/{created['id']}", headers=headers).status_code == 204
    listed = client.get(f"/apis/{api['id']}/tokens", headers=headers).json()
    assert listed[0]["status"] == "revoked"


def test_token_isolation(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    api = create_api(client, headers_a)
    created = create_token(client, headers_a, api["id"])

    assert client.get(f"/apis/{api['id']}/tokens", headers=headers_b).status_code == 404
    assert client.delete(f"/tokens/{created['id']}", headers=headers_b).status_code == 404
