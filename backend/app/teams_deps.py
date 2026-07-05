"""Team/RBAC authorization dependencies.

Teams are opt-in: the active context comes from an optional `X-Team-Id`
header. Absent header -> PersonalContext (today's single-owner flow,
unchanged). Present header -> TeamContext, requiring the caller to be a
member (404 otherwise, to avoid leaking whether a team id exists).
"""

from dataclasses import dataclass
from typing import Union

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.auth import get_current_user
from app.db.postgres import get_db

ADMIN_ROLES = ("owner", "admin")


@dataclass
class PersonalContext:
    user: models.User


@dataclass
class TeamContext:
    user: models.User
    team: models.Team
    membership: models.TeamMembership


Context = Union[PersonalContext, TeamContext]


def get_active_context(
    x_team_id: str | None = Header(default=None, alias="X-Team-Id"),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Context:
    if not x_team_id:
        return PersonalContext(user=user)

    team = db.get(models.Team, x_team_id)
    membership = (
        db.scalar(
            select(models.TeamMembership).where(
                models.TeamMembership.team_id == x_team_id,
                models.TeamMembership.user_id == user.id,
            )
        )
        if team is not None
        else None
    )
    if team is None or membership is None:
        # 404 (not 403) so a non-member can't tell a team id exists
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return TeamContext(user=user, team=team, membership=membership)


def require_team_role(*roles: str):
    """Factory: require an active TEAM context with membership.role in roles."""

    def dependency(ctx: Context = Depends(get_active_context)) -> TeamContext:
        if not isinstance(ctx, TeamContext):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "This action requires an active team"
            )
        if ctx.membership.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return ctx

    return dependency


def get_team_membership_path(
    team_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeamContext:
    """For /teams/{team_id}/... endpoints, where the team is named in the
    path rather than selected via X-Team-Id."""
    team = db.get(models.Team, team_id)
    membership = (
        db.scalar(
            select(models.TeamMembership).where(
                models.TeamMembership.team_id == team_id,
                models.TeamMembership.user_id == user.id,
            )
        )
        if team is not None
        else None
    )
    if team is None or membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return TeamContext(user=user, team=team, membership=membership)


def require_team_role_path(*roles: str):
    def dependency(
        ctx: TeamContext = Depends(get_team_membership_path),
    ) -> TeamContext:
        if ctx.membership.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return ctx

    return dependency


@dataclass
class ScopedCredential:
    credential: models.ApiCredential
    ctx: Context
    is_admin: bool

    @property
    def user_id(self) -> str:
        return self.ctx.user.id


def get_scoped_credential(
    api_id: str,
    ctx: Context = Depends(get_active_context),
    db: Session = Depends(get_db),
) -> ScopedCredential:
    cred = db.get(models.ApiCredential, api_id)
    if cred is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API not found")

    if cred.team_id is None:
        # personal API: exactly today's check
        if not isinstance(ctx, PersonalContext) or cred.user_id != ctx.user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "API not found")
        return ScopedCredential(credential=cred, ctx=ctx, is_admin=True)

    # team API: caller must be in the same team as the credential
    if not isinstance(ctx, TeamContext) or ctx.team.id != cred.team_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API not found")
    is_admin = ctx.membership.role in ADMIN_ROLES
    return ScopedCredential(credential=cred, ctx=ctx, is_admin=is_admin)


def require_credential_admin(
    scoped: ScopedCredential = Depends(get_scoped_credential),
) -> ScopedCredential:
    if not scoped.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin or owner role required")
    return scoped


def require_credential_access(
    scoped: ScopedCredential = Depends(get_scoped_credential),
    db: Session = Depends(get_db),
) -> ScopedCredential:
    if scoped.is_admin:
        return scoped
    grant = db.scalar(
        select(models.ApiAccessGrant).where(
            models.ApiAccessGrant.credential_id == scoped.credential.id,
            models.ApiAccessGrant.user_id == scoped.user_id,
        )
    )
    if grant is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "You don't have access to this API"
        )
    return scoped
