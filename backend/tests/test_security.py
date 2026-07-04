from app.security import (
    PROXY_TOKEN_PREFIX,
    decrypt_secret,
    encrypt_secret,
    generate_proxy_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("hunter2secret")
    assert h != "hunter2secret"
    assert verify_password("hunter2secret", h)
    assert not verify_password("wrong", h)


def test_secret_encryption_roundtrip():
    ct = encrypt_secret("sk-super-secret")
    assert b"sk-super-secret" not in ct
    assert decrypt_secret(ct) == "sk-super-secret"


def test_proxy_token_format_and_hash():
    t1, t2 = generate_proxy_token(), generate_proxy_token()
    assert t1.startswith(PROXY_TOKEN_PREFIX)
    assert t1 != t2  # random
    assert hash_token(t1) == hash_token(t1)  # deterministic
    assert len(hash_token(t1)) == 64  # sha256 hex
