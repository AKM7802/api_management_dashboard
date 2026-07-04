"""SQLAlchemy models for the transactional store (PostgreSQL).

UUIDs are stored as 36-char strings so SQLite works for dev/tests unchanged.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String
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
    """An upstream API the user manages (e.g. their OpenAI key)."""

    __tablename__ = "api_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str] = mapped_column(String(40))  # openai | anthropic | custom
    base_url: Mapped[str] = mapped_column(String(500))
    encrypted_secret: Mapped[bytes] = mapped_column(LargeBinary)
    secret_last4: Mapped[str] = mapped_column(String(4))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | disabled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="credentials")
    proxy_tokens: Mapped[list["ProxyToken"]] = relationship(
        back_populates="credential", cascade="all, delete-orphan"
    )


class ProxyToken(Base):
    __tablename__ = "proxy_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    credential_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("api_credentials.id", ondelete="CASCADE"), index=True
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
