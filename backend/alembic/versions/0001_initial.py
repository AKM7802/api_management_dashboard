"""Initial schema: users, api_credentials, proxy_tokens.

Frozen as explicit ops matching the original (pre-teams) model shape. This
migration must NEVER be edited to track later model changes — it previously
used `Base.metadata.create_all()`, which silently drifted to include every
table currently in models.py (including tables added by later revisions,
e.g. 0002's teams/RBAC tables), causing a duplicate-table error when 0002
ran its own explicit `create_table`. Future schema changes belong in new
revisions with explicit ops, never by editing this file.
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "api_credentials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("encrypted_secret", sa.LargeBinary, nullable=False),
        sa.Column("secret_last4", sa.String(4), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "proxy_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "credential_id", sa.String(36),
            sa.ForeignKey("api_credentials.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("token_prefix", sa.String(24), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("proxy_tokens")
    op.drop_table("api_credentials")
    op.drop_table("users")
