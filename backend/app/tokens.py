"""Proxy-token lifecycle: create (raw shown once), list, revoke.

Context-aware: in Personal mode this is unchanged. In team mode, a member
(non-admin) only sees/revokes tokens they created themselves; admins/owners
and personal owners see and manage every token on the credential.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.db.postgres import get_db
from app.security import generate_proxy_token, hash_token
from app.teams_deps import ScopedCredential, require_credential_access
from app.token_cache import invalidate_token

router = APIRouter(tags=["tokens"])


@router.get("/apis/{api_id}/tokens", response_model=list[schemas.ProxyTokenOut])
def list_tokens(
    scoped: ScopedCredential = Depends(require_credential_access),
    db: Session = Depends(get_db),
):
    query = select(models.ProxyToken).where(
        models.ProxyToken.credential_id == scoped.credential.id
    )
    if not scoped.is_admin:
        query = query.where(models.ProxyToken.created_by_user_id == scoped.user_id)
    return db.scalars(query.order_by(models.ProxyToken.created_at.desc())).all()


@router.post(
    "/apis/{api_id}/tokens",
    response_model=schemas.ProxyTokenCreated,
    status_code=201,
)
def create_token(
    body: schemas.ProxyTokenCreate,
    scoped: ScopedCredential = Depends(require_credential_access),
    db: Session = Depends(get_db),
):
    raw = generate_proxy_token()
    token = models.ProxyToken(
        credential_id=scoped.credential.id,
        created_by_user_id=scoped.user_id,
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
    request: Request,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.get(models.ProxyToken, token_id)
    if token is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    cred = token.credential

    allowed = token.created_by_user_id == user.id
    if not allowed and cred.team_id is None:
        allowed = cred.user_id == user.id
    elif not allowed and cred.team_id is not None:
        membership = db.scalar(
            select(models.TeamMembership).where(
                models.TeamMembership.team_id == cred.team_id,
                models.TeamMembership.user_id == user.id,
            )
        )
        allowed = membership is not None and membership.role in ("owner", "admin")
    if not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")

    token.status = "revoked"
    db.commit()
    # revocation must take effect immediately, not after the cache TTL
    invalidate_token(request.app, token.token_hash)
