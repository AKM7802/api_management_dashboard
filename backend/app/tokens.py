"""Proxy-token lifecycle: create (raw shown once), list, revoke."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.apis import get_owned_credential
from app.auth import get_current_user
from app.db.postgres import get_db
from app.security import generate_proxy_token, hash_token

router = APIRouter(tags=["tokens"])


@router.get("/apis/{api_id}/tokens", response_model=list[schemas.ProxyTokenOut])
def list_tokens(
    cred: models.ApiCredential = Depends(get_owned_credential),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.ProxyToken)
        .where(models.ProxyToken.credential_id == cred.id)
        .order_by(models.ProxyToken.created_at.desc())
    ).all()


@router.post(
    "/apis/{api_id}/tokens",
    response_model=schemas.ProxyTokenCreated,
    status_code=201,
)
def create_token(
    body: schemas.ProxyTokenCreate,
    cred: models.ApiCredential = Depends(get_owned_credential),
    db: Session = Depends(get_db),
):
    raw = generate_proxy_token()
    token = models.ProxyToken(
        credential_id=cred.id,
        name=body.name,
        token_hash=hash_token(raw),
        token_prefix=raw[:14],  # "xpxy_live_" + 4 chars
    )
    db.add(token)
    db.commit()
    # raw token is returned exactly once and never stored
    return schemas.ProxyTokenCreated(
        id=token.id,
        name=token.name,
        token_prefix=token.token_prefix,
        status=token.status,
        created_at=token.created_at,
        last_used_at=token.last_used_at,
        token=raw,
    )


@router.delete("/tokens/{token_id}", status_code=204)
def revoke_token(
    token_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.get(models.ProxyToken, token_id)
    if token is None or token.credential.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    token.status = "revoked"
    db.commit()
