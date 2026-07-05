"""Invitation preview + accept — the two endpoints a claimed link needs.

Not nested under /teams/{team_id} because the raw token itself identifies
the team; the caller doesn't know the team id until they look it up.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_user
from app.db.postgres import get_db
from app.security import hash_token

router = APIRouter(prefix="/invitations", tags=["invitations"])


def _as_aware_utc(dt: datetime) -> datetime:
    """SQLite round-trips DateTime(timezone=True) as naive; Postgres doesn't.
    Normalize so comparisons against datetime.now(timezone.utc) work on both."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _load_pending_invite(db: Session, token: str) -> models.TeamInvitation:
    invite = db.scalar(
        select(models.TeamInvitation).where(
            models.TeamInvitation.token_hash == hash_token(token)
        )
    )
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    if invite.status != "pending":
        raise HTTPException(status.HTTP_410_GONE, "This invitation is no longer valid")
    if _as_aware_utc(invite.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "This invitation has expired")
    return invite


@router.get("/{token}", response_model=schemas.InvitationPreview)
def preview_invitation(
    token: str,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    invite = _load_pending_invite(db, token)
    team = db.get(models.Team, invite.team_id)
    return schemas.InvitationPreview(
        team_name=team.name, role=invite.role, email=invite.email
    )


@router.post("/accept", status_code=204)
def accept_invitation(
    body: schemas.InvitationAccept,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = _load_pending_invite(db, body.token)

    existing = db.scalar(
        select(models.TeamMembership).where(
            models.TeamMembership.team_id == invite.team_id,
            models.TeamMembership.user_id == user.id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You're already a member of this team"
        )

    db.add(
        models.TeamMembership(
            team_id=invite.team_id, user_id=user.id, role=invite.role
        )
    )
    invite.status = "accepted"
    invite.accepted_by_user_id = user.id
    db.commit()
