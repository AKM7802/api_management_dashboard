"""SQLAlchemy models for the transactional store (PostgreSQL).

UUIDs are stored as 36-char strings so SQLite works for dev/tests unchanged.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.postgres import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    credentials: Mapped[list["ApiCredential"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ApiCredential(Base):
    """An upstream API the user manages (e.g. their OpenAI key).

    `team_id` is nullable: NULL means a personal API owned directly by
    `user_id` (the original, unchanged single-owner flow). A non-null
    `team_id` means a team API, governed by TeamMembership roles and
    ApiAccessGrant — `user_id` is then just the creator, not the sole owner.
    """

    __tablename__ = "api_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str] = mapped_column(String(40))  # openai | anthropic | custom
    base_url: Mapped[str] = mapped_column(String(500))
    encrypted_secret: Mapped[bytes] = mapped_column(LargeBinary)
    secret_last4: Mapped[str] = mapped_column(String(4))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | disabled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="credentials")
    team: Mapped["Team | None"] = relationship(back_populates="credentials")
    proxy_tokens: Mapped[list["ProxyToken"]] = relationship(
        back_populates="credential", cascade="all, delete-orphan"
    )
    access_grants: Mapped[list["ApiAccessGrant"]] = relationship(
        back_populates="credential", cascade="all, delete-orphan"
    )


class ProxyToken(Base):
    __tablename__ = "proxy_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    credential_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("api_credentials.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_prefix: Mapped[str] = mapped_column(String(24))  # "xpxy_live_ab12" for display
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | revoked
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    credential: Mapped[ApiCredential] = relationship(back_populates="proxy_tokens")


class Team(Base):
    """Created only via the explicit "Create Team" action — never implicit.

    Absence of a team (a user who has never created/joined one) is Personal
    mode: the original single-owner flow, entirely untouched by this model.
    """

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    memberships: Mapped[list["TeamMembership"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )
    credentials: Mapped[list[ApiCredential]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )
    invitations: Mapped[list["TeamInvitation"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )


class TeamMembership(Base):
    __tablename__ = "team_memberships"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))  # owner | admin | member
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    team: Mapped[Team] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship()

    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_member"),)


class ApiAccessGrant(Base):
    """Team APIs only: grants a member permission to mint/use their own
    proxy tokens for this credential, and to view their own usage of it.
    Owners/admins never need a grant — they have implicit team-wide access.
    """

    __tablename__ = "api_access_grants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    credential_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("api_credentials.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    granted_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    credential: Mapped[ApiCredential] = relationship(back_populates="access_grants")
    user: Mapped[User] = relationship(foreign_keys=[user_id])

    __table_args__ = (UniqueConstraint("credential_id", "user_id", name="uq_api_grant"),)


class TeamInvitation(Base):
    """A claimable invite link (no email infra in v1) — the raw token is
    shown once at creation; only its hash is stored, mirroring ProxyToken.
    """

    __tablename__ = "team_invitations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(20))  # admin | member (never "owner")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | accepted | revoked
    invited_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    accepted_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    team: Mapped[Team] = relationship(back_populates="invitations")
