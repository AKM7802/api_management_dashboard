from tests.conftest import signup


def test_signup_login_me(client):
    headers = signup(client, "a@example.com")

    r = client.get("/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == "a@example.com"

    r = client.post(
        "/auth/login", json={"email": "a@example.com", "password": "password123"}
    )
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_duplicate_email_rejected(client):
    signup(client, "dup@example.com")
    r = client.post(
        "/auth/signup", json={"email": "dup@example.com", "password": "password123"}
    )
    assert r.status_code == 409


def test_wrong_password_rejected(client):
    signup(client, "b@example.com")
    r = client.post("/auth/login", json={"email": "b@example.com", "password": "nope1234"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401
    assert (
        client.get("/auth/me", headers={"Authorization": "Bearer garbage"}).status_code
        == 401
    )


def test_short_password_rejected(client):
    r = client.post("/auth/signup", json={"email": "c@example.com", "password": "short"})
    assert r.status_code == 422
