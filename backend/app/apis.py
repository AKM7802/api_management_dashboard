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
from app.security import encrypt_secret, generate_proxy_token, hash_token
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


def _api_out(cred: models.ApiCredential, is_admin: bool) -> schemas.ApiOut:
    """The upstream base_url/key are admin-only — a granted member calls the
    gateway's own proxy URL and never needs (or sees) what's behind it."""
    return schemas.ApiOut(
        id=cred.id,
        name=cred.name,
        base_url=cred.base_url if is_admin else None,
        secret_last4=cred.secret_last4 if is_admin else None,
        status=cred.status,
        created_at=cred.created_at,
        team_id=cred.team_id,
    )


def _check_name_available(
    db: Session,
    name: str,
    user_id: str,
    team_id: str | None,
    exclude_id: str | None = None,
) -> None:
    """Names must be unique within their scope — a user's personal APIs, or
    a team's APIs — so the dashboard/dropdowns never show two entries a
    person can't tell apart."""
    query = select(models.ApiCredential).where(models.ApiCredential.name == name)
    if team_id is None:
        query = query.where(
            models.ApiCredential.user_id == user_id,
            models.ApiCredential.team_id.is_(None),
        )
    else:
        query = query.where(models.ApiCredential.team_id == team_id)
    if exclude_id is not None:
        query = query.where(models.ApiCredential.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'An API named "{name}" already exists.',
        )


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
        creds = db.scalars(
            select(models.ApiCredential)
            .where(
                models.ApiCredential.user_id == ctx.user.id,
                models.ApiCredential.team_id.is_(None),
            )
            .order_by(models.ApiCredential.created_at.desc())
        ).all()
        return [_api_out(c, is_admin=True) for c in creds]

    is_admin = ctx.membership.role in ADMIN_ROLES
    query = select(models.ApiCredential).where(
        models.ApiCredential.team_id == ctx.team.id
    )
    if not is_admin:
        # members only see APIs they've been individually granted
        query = query.join(
            models.ApiAccessGrant,
            models.ApiAccessGrant.credential_id == models.ApiCredential.id,
        ).where(models.ApiAccessGrant.user_id == ctx.user.id)
    creds = db.scalars(query.order_by(models.ApiCredential.created_at.desc())).all()
    return [_api_out(c, is_admin=is_admin) for c in creds]


@router.post("", response_model=schemas.ApiCreated, status_code=201)
def create_api(
    body: schemas.ApiCreate,
    ctx: Context = Depends(get_active_context),
    db: Session = Depends(get_db),
):
    if isinstance(ctx, TeamContext) and ctx.membership.role not in ADMIN_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Admin or owner role required"
        )
    team_id = ctx.team.id if isinstance(ctx, TeamContext) else None
    _check_name_available(db, body.name, ctx.user.id, team_id)
    cred = models.ApiCredential(
        user_id=ctx.user.id,
        team_id=team_id,
        name=body.name,
        base_url=body.base_url.rstrip("/"),
        encrypted_secret=encrypt_secret(body.secret),
        secret_last4=body.secret[-4:],
    )
    db.add(cred)
    db.flush()  # assigns cred.id, without committing yet

    # mint a token for the creator in the same request — otherwise every new
    # API is unusable until a separate trip to the Access Tokens tab
    raw = generate_proxy_token()
    token = models.ProxyToken(
        credential_id=cred.id,
        created_by_user_id=ctx.user.id,
        name="default",
        token_hash=hash_token(raw),
        token_prefix=raw[:14],
    )
    db.add(token)
    db.commit()

    return schemas.ApiCreated(
        **_api_out(cred, is_admin=True).model_dump(),
        token=schemas.ProxyTokenCreated(
            id=token.id,
            name=token.name,
            token_prefix=token.token_prefix,
            status=token.status,
            created_at=token.created_at,
            last_used_at=token.last_used_at,
            token=raw,
        ),
    )


@router.post("/{api_id}/attach-team", response_model=schemas.ApiOut)
def attach_to_team(
    api_id: str,
    body: schemas.ApiAttachTeam,
    request: Request,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move one of the caller's own personal APIs into a team they admin —
    lets an owner/admin reuse an API they already registered instead of
    re-entering the same secret as a brand new team API. One-way (personal
    -> team); there's no endpoint to move a team API back to personal."""
    cred = db.get(models.ApiCredential, api_id)
    if cred is None or cred.user_id != user.id or cred.team_id is not None:
        # 404 (not 403) so we don't leak other users' resource ids, and so
        # "already in a team" (see below) is the only 400 this can raise
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API not found")

    membership = db.scalar(
        select(models.TeamMembership).where(
            models.TeamMembership.team_id == body.team_id,
            models.TeamMembership.user_id == user.id,
        )
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    if membership.role not in ADMIN_ROLES:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Admin or owner role required"
        )
    _check_name_available(db, cred.name, user.id, body.team_id)

    cred.team_id = body.team_id
    db.commit()
    # the caller's own cached token(s) for this credential were resolved
    # under the old (personal) rules -- force a fresh check so the new
    # team rules (their own admin/owner access) apply immediately
    invalidate_credential(request.app, cred.id)
    return cred


@router.get("/{api_id}", response_model=schemas.ApiOut)
def get_api(scoped: ScopedCredential = Depends(require_credential_access)):
    # viewing (name/status) is available to any granted member, not just
    # admins — base_url/key are admin-only, and configuring (PATCH/DELETE,
    # below) is admin-only too
    return _api_out(scoped.credential, is_admin=scoped.is_admin)


@router.patch("/{api_id}", response_model=schemas.ApiOut)
def update_api(
    body: schemas.ApiUpdate,
    request: Request,
    scoped: ScopedCredential = Depends(require_credential_admin),
    db: Session = Depends(get_db),
):
    cred = scoped.credential
    if body.name is not None and body.name != cred.name:
        _check_name_available(db, body.name, cred.user_id, cred.team_id, exclude_id=cred.id)
        cred.name = body.name
    if body.status is not None:
        cred.status = body.status
    if body.base_url is not None:
        cred.base_url = body.base_url.rstrip("/")
    if body.secret is not None:  # secret rotation
        cred.encrypted_secret = encrypt_secret(body.secret)
        cred.secret_last4 = body.secret[-4:]
    db.commit()
    # disable/rotation/base_url changes must take effect immediately, not
    # after the cache TTL, since the proxy reads all three off the cache
    if body.status is not None or body.base_url is not None or body.secret is not None:
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
