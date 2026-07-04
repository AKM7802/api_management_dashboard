from tests.conftest import create_api, signup


def test_create_and_list_api(client):
    headers = signup(client)
    api = create_api(client, headers, secret="sk-abcd1234")

    assert api["secret_last4"] == "1234"
    assert "secret" not in api and "encrypted_secret" not in api
    assert api["status"] == "active"

    r = client.get("/apis", headers=headers)
    assert r.status_code == 200
    assert [a["id"] for a in r.json()] == [api["id"]]


def test_update_api_and_rotate_secret(client):
    headers = signup(client)
    api = create_api(client, headers)

    r = client.patch(
        f"/apis/{api['id']}",
        json={"name": "renamed", "status": "disabled", "secret": "sk-new-secret-key-5678"},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "renamed"
    assert body["status"] == "disabled"
    assert body["secret_last4"] == "5678"


def test_delete_api(client):
    headers = signup(client)
    api = create_api(client, headers)
    assert client.delete(f"/apis/{api['id']}", headers=headers).status_code == 204
    assert client.get(f"/apis/{api['id']}", headers=headers).status_code == 404


def test_user_isolation(client):
    headers_a = signup(client, "a@x.com")
    headers_b = signup(client, "b@x.com")
    api = create_api(client, headers_a)

    # user B can't see, edit, or delete A's API
    assert client.get(f"/apis/{api['id']}", headers=headers_b).status_code == 404
    assert (
        client.patch(f"/apis/{api['id']}", json={"name": "x"}, headers=headers_b).status_code
        == 404
    )
    assert client.delete(f"/apis/{api['id']}", headers=headers_b).status_code == 404
    assert client.get("/apis", headers=headers_b).json() == []


def test_apis_require_auth(client):
    assert client.get("/apis").status_code == 401
