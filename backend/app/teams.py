"""Team creation, membership, and role management.

Teams are entirely opt-in: creating one is the only way they come into
existence, and it's the only place a "personal" user first becomes an
"owner". Nothing here affects users who never call POST /teams.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.db.postgres import get_db
from app.security import generate_invite_token, hash_token
from app.teams_deps import (
    ADMIN_ROLES,
    TeamContext,
    get_team_membership_path,
    require_team_role_path,
)
from app.token_cache import invalidate_grant

router = APIRouter(prefix="/teams", tags=["teams"])

INVITATION_TTL = timedelta(days=7)


def _invalidate_all_team_access(app, db: Session, team_id: str, user_id: str) -> None:
    """Drop this user's cached tokens across every credential in the team —
    used when their standing access could have changed for reasons other
    than an explicit grant revoke (removed from the team, or demoted from
    admin/owner so their implicit team-wide access no longer applies)."""
    credential_ids = db.scalars(
        select(models.ApiCredential.id).where(models.ApiCredential.team_id == team_id)
    ).all()
    for credential_id in credential_ids:
        invalidate_grant(app, credential_id, user_id)


def _revoke_all_team_grants(db: Session, team_id: str, user_id: str) -> None:
    """Delete every ApiAccessGrant this user holds within the team — called
    on member removal so a stale grant row can't silently keep working (the
    grant lookup would otherwise still find it even though team membership
    is gone), and so a future re-invite starts from a clean slate."""
    credential_ids = db.scalars(
        select(models.ApiCredential.id).where(models.ApiCredential.team_id == team_id)
    ).all()
    if not credential_ids:
        return
    grants = db.scalars(
        select(models.ApiAccessGrant).where(
            models.ApiAccessGrant.user_id == user_id,
            models.ApiAccessGrant.credential_id.in_(credential_ids),
        )
    ).all()
    for grant in grants:
        db.delete(grant)


def _team_out(team: models.Team, role: str) -> schemas.TeamOut:
    return schemas.TeamOut(
        id=team.id, name=team.name, created_at=team.created_at, my_role=role
    )


@router.get("", response_model=list[schemas.TeamOut])
def list_my_teams(
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = db.execute(
        select(models.Team, models.TeamMembership.role)
        .join(
            models.TeamMembership,
            models.TeamMembership.team_id == models.Team.id,
        )
        .where(models.TeamMembership.user_id == user.id)
        .order_by(models.Team.created_at)
    ).all()
    return [_team_out(team, role) for team, role in rows]


@router.post("", response_model=schemas.TeamOut, status_code=201)
def create_team(
    body: schemas.TeamCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The "Create Team" action: caller becomes owner. This is the only way
    a team is ever created — no implicit/personal teams exist."""
    team = models.Team(name=body.name)
    db.add(team)
    db.flush()  # assign team.id before the membership row references it
    membership = models.TeamMembership(team_id=team.id, user_id=user.id, role="owner")
    db.add(membership)
    db.commit()
    return _team_out(team, "owner")


@router.get("/{team_id}", response_model=schemas.TeamOut)
def get_team(ctx: TeamContext = Depends(get_team_membership_path)):
    return _team_out(ctx.team, ctx.membership.role)


@router.patch("/{team_id}", response_model=schemas.TeamOut)
def rename_team(
    body: schemas.TeamUpdate,
    ctx: TeamContext = Depends(require_team_role_path(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    ctx.team.name = body.name
    db.commit()
    return _team_out(ctx.team, ctx.membership.role)


@router.delete("/{team_id}", status_code=204)
def delete_team(
    ctx: TeamContext = Depends(require_team_role_path("owner")),
    db: Session = Depends(get_db),
):
    """Cascades: every team API, its tokens, its grants, and pending
    invitations are deleted along with the team (confirmed destructive
    behavior — the frontend must require a typed confirmation)."""
    db.delete(ctx.team)
    db.commit()


@router.post("/{team_id}/transfer", status_code=204)
def transfer_ownership(
    body: schemas.TransferOwnershipRequest,
    ctx: TeamContext = Depends(require_team_role_path("owner")),
    db: Session = Depends(get_db),
):
    new_owner = db.scalar(
        select(models.TeamMembership).where(
            models.TeamMembership.team_id == ctx.team.id,
            models.TeamMembership.user_id == body.user_id,
        )
    )
    if new_owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That user isn't a team member")
    new_owner.role = "owner"
    ctx.membership.role = "admin"  # the previous owner becomes an admin
    db.commit()


@router.get("/{team_id}/members", response_model=list[schemas.MemberOut])
def list_members(
    ctx: TeamContext = Depends(get_team_membership_path), db: Session = Depends(get_db)
):
    rows = db.execute(
        select(models.TeamMembership, models.User)
        .join(models.User, models.User.id == models.TeamMembership.user_id)
        .where(models.TeamMembership.team_id == ctx.team.id)
        .order_by(models.TeamMembership.created_at)
    ).all()
    return [
        schemas.MemberOut(
            user_id=user.id, email=user.email, role=m.role, joined_at=m.created_at
        )
        for m, user in rows
    ]


@router.patch("/{team_id}/members/{user_id}", response_model=schemas.MemberOut)
def update_member_role(
    user_id: str,
    body: schemas.MemberRoleUpdate,
    request: Request,
    ctx: TeamContext = Depends(require_team_role_path(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    target = db.scalar(
        select(models.TeamMembership).where(
            models.TeamMembership.team_id == ctx.team.id,
            models.TeamMembership.user_id == user_id,
        )
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    if target.role == "owner":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Use /transfer to change the owner"
        )
    if body.role == "owner":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Use /transfer to grant ownership"
        )
    # only the owner may promote/demote an admin; admins may only manage members
    if target.role == "admin" and ctx.membership.role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the owner can change an admin's role"
        )
    was_admin = target.role in ADMIN_ROLES
    target.role = body.role
    db.commit()
    if was_admin and body.role == "member":
        # ex-admin's implicit team-wide access no longer applies — only
        # explicit grants count now, so drop any cached tokens immediately
        _invalidate_all_team_access(request.app, db, ctx.team.id, user_id)
    user = db.get(models.User, user_id)
    return schemas.MemberOut(
        user_id=user_id, email=user.email, role=target.role, joined_at=target.created_at
    )


@router.delete("/{team_id}/members/{user_id}", status_code=204)
def remove_member(
    user_id: str,
    request: Request,
    ctx: TeamContext = Depends(require_team_role_path(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    target = db.scalar(
        select(models.TeamMembership).where(
            models.TeamMembership.team_id == ctx.team.id,
            models.TeamMembership.user_id == user_id,
        )
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    if target.role == "owner":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The owner can't be removed — transfer ownership first",
        )
    if target.role == "admin" and ctx.membership.role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the owner can remove an admin"
        )
    db.delete(target)
    _revoke_all_team_grants(db, ctx.team.id, user_id)
    db.commit()
    _invalidate_all_team_access(request.app, db, ctx.team.id, user_id)


# --- invitations (claimable link, no email infra — v1) -----------------------


@router.post(
    "/{team_id}/invitations", response_model=schemas.InvitationCreated, status_code=201
)
def create_invitation(
    body: schemas.InvitationCreate,
    ctx: TeamContext = Depends(require_team_role_path(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    existing_member = db.scalar(
        select(models.TeamMembership)
        .join(models.User, models.User.id == models.TeamMembership.user_id)
        .where(
            models.TeamMembership.team_id == ctx.team.id,
            models.User.email == body.email,
        )
    )
    if existing_member is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This person is already a team member"
        )
    pending = db.scalar(
        select(models.TeamInvitation).where(
            models.TeamInvitation.team_id == ctx.team.id,
            models.TeamInvitation.email == body.email,
            models.TeamInvitation.status == "pending",
        )
    )
    if pending is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An invitation for this email is already pending"
        )

    raw = generate_invite_token()
    invite = models.TeamInvitation(
        team_id=ctx.team.id,
        email=body.email,
        role=body.role,
        token_hash=hash_token(raw),
        status="pending",
        invited_by_user_id=ctx.user.id,
        expires_at=datetime.now(timezone.utc) + INVITATION_TTL,
    )
    db.add(invite)
    db.commit()
    return schemas.InvitationCreated(
        id=invite.id,
        email=invite.email,
        role=invite.role,
        status=invite.status,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        token=raw,
    )


@router.get("/{team_id}/invitations", response_model=list[schemas.InvitationOut])
def list_invitations(
    ctx: TeamContext = Depends(require_team_role_path(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(models.TeamInvitation)
        .where(
            models.TeamInvitation.team_id == ctx.team.id,
            models.TeamInvitation.status == "pending",
        )
        .order_by(models.TeamInvitation.created_at.desc())
    ).all()


@router.delete("/{team_id}/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    invitation_id: str,
    ctx: TeamContext = Depends(require_team_role_path(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    invite = db.get(models.TeamInvitation, invitation_id)
    if invite is None or invite.team_id != ctx.team.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    invite.status = "revoked"
    db.commit()
