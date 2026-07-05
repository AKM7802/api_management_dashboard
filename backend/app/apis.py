"""CRUD for managed APIs (upstream credentials). Secrets encrypted at rest.

Context-aware: with no active team (Personal mode), behavior is identical to
the original single-owner flow. With an active team (X-Team-Id), APIs are
created/listed/configured under that team, gated by role.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.db.postgres import get_db
from app.security import encrypt_secret
from app.teams_deps import (
    ADMIN_ROLES,
    Context,
    PersonalContext,
    ScopedCredential,
    TeamContext,
    get_active_context,
    require_credential_access,
    require_credential_admin,
)
from app.token_cache import invalidate_credential, invalidate_grant

router = APIRouter(prefix="/apis", tags=["apis"])


def get_owned_credential(
    api_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.ApiCredential:
    """Personal-mode-only loader, still used by tokens.py/usage.py until
    Phase 3 rewires them onto require_credential_access for team support."""
    cred = db.get(models.ApiCredential, api_id)
    if cred is None or cred.user_id != user.id or cred.team_id is not None:
        # 404 (not 403) so we don't leak other users' resource ids
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API not found")
    return cred


@router.get("", response_model=list[schemas.ApiOut])
def list_apis(
    ctx: Context = Depends(get_active_context), db: Session = Depends(get_db)
):
    if isinstance(ctx, PersonalContext):
        return db.scalars(
            select(models.ApiCredential)
            .where(
                models.ApiCredential.user_id == ctx.user.id,
                models.ApiCredential.team_id.is_(None),
            )
            .order_by(models.ApiCredential.created_at.desc())
        ).all()

    query = select(models.ApiCredential).where(
        models.ApiCredential.team_id == ctx.team.id
    )
    if ctx.membership.role not in ADMIN_ROLES:
        # members only see APIs they've been individually granted
        query = query.join(
            models.ApiAccessGrant,
            models.ApiAccessGrant.credential_id == models.ApiCredential.id,
        ).where(models.ApiAccessGrant.user_id == ctx.user.id)
    return db.scalars(query.order_by(models.ApiCredential.created_at.desc())).all()


@router.post("", response_model=schemas.ApiOut, status_code=201)
def create_api(
    body: schemas.ApiCreate,
    ctx: Context = Depends(get_active_context),
    db: Session = Depends(get_db),
):
    if isinstance(ctx, TeamContext) and ctx.membership.role not in ADMIN_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Admin or owner role required"
        )
    cred = models.ApiCredential(
        user_id=ctx.user.id,
        team_id=ctx.team.id if isinstance(ctx, TeamContext) else None,
        name=body.name,
        provider=body.provider,
        base_url=body.base_url.rstrip("/"),
        encrypted_secret=encrypt_secret(body.secret),
        secret_last4=body.secret[-4:],
    )
    db.add(cred)
    db.commit()
    return cred


@router.get("/{api_id}", response_model=schemas.ApiOut)
def get_api(scoped: ScopedCredential = Depends(require_credential_access)):
    # viewing (name/provider/status) is available to any granted member, not
    # just admins — only configuring (PATCH/DELETE, below) is admin-only
    return scoped.credential


@router.patch("/{api_id}", response_model=schemas.ApiOut)
def update_api(
    body: schemas.ApiUpdate,
    request: Request,
    scoped: ScopedCredential = Depends(require_credential_admin),
    db: Session = Depends(get_db),
):
    cred = scoped.credential
    if body.name is not None:
        cred.name = body.name
    if body.status is not None:
        cred.status = body.status
    if body.secret is not None:  # secret rotation
        cred.encrypted_secret = encrypt_secret(body.secret)
        cred.secret_last4 = body.secret[-4:]
    db.commit()
    # disable/rotation must take effect immediately, not after the cache TTL
    if body.status is not None or body.secret is not None:
        invalidate_credential(request.app, cred.id)
    return cred


@router.delete("/{api_id}", status_code=204)
def delete_api(
    request: Request,
    scoped: ScopedCredential = Depends(require_credential_admin),
    db: Session = Depends(get_db),
):
    credential_id = scoped.credential.id
    db.delete(scoped.credential)
    db.commit()
    invalidate_credential(request.app, credential_id)


# --- per-person access grants (team APIs only) -------------------------------


def _require_team_credential(
    scoped: ScopedCredential = Depends(require_credential_admin),
) -> ScopedCredential:
    if scoped.credential.team_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Grants only apply to team APIs"
        )
    return scoped


@router.get("/{api_id}/grants", response_model=list[schemas.GrantOut])
def list_grants(
    scoped: ScopedCredential = Depends(_require_team_credential),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(models.ApiAccessGrant, models.User)
        .join(models.User, models.User.id == models.ApiAccessGrant.user_id)
        .where(models.ApiAccessGrant.credential_id == scoped.credential.id)
        .order_by(models.ApiAccessGrant.created_at)
    ).all()
    return [
        schemas.GrantOut(user_id=user.id, email=user.email, granted_at=g.created_at)
        for g, user in rows
    ]


@router.post("/{api_id}/grants", response_model=schemas.GrantOut, status_code=201)
def grant_access(
    body: schemas.GrantCreate,
    request: Request,
    scoped: ScopedCredential = Depends(_require_team_credential),
    db: Session = Depends(get_db),
):
    is_member = db.scalar(
        select(models.TeamMembership).where(
            models.TeamMembership.team_id == scoped.credential.team_id,
            models.TeamMembership.user_id == body.user_id,
        )
    )
    if is_member is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That user isn't a member of this team"
        )

    existing = db.scalar(
        select(models.ApiAccessGrant).where(
            models.ApiAccessGrant.credential_id == scoped.credential.id,
            models.ApiAccessGrant.user_id == body.user_id,
        )
    )
    if existing is None:
        existing = models.ApiAccessGrant(
            credential_id=scoped.credential.id,
            user_id=body.user_id,
            granted_by_user_id=scoped.user_id,
        )
        db.add(existing)
        db.commit()
        # the proxy may have already cached a "denied" resolution for this
        # member's token(s) on this credential — force an immediate re-check
        invalidate_grant(request.app, scoped.credential.id, body.user_id)
    user = db.get(models.User, body.user_id)
    return schemas.GrantOut(
        user_id=user.id, email=user.email, granted_at=existing.created_at
    )


@router.delete("/{api_id}/grants/{user_id}", status_code=204)
def revoke_access(
    user_id: str,
    request: Request,
    scoped: ScopedCredential = Depends(_require_team_credential),
    db: Session = Depends(get_db),
):
    grant = db.scalar(
        select(models.ApiAccessGrant).where(
            models.ApiAccessGrant.credential_id == scoped.credential.id,
            models.ApiAccessGrant.user_id == user_id,
        )
    )
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grant not found")
    db.delete(grant)
    db.commit()
    # deny-at-proxy immediately — tokens are kept, re-granting restores them
    invalidate_grant(request.app, scoped.credential.id, user_id)
