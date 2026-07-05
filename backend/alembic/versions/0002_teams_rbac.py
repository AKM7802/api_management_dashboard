"""Optional teams + RBAC + per-person API access grants.

Additive only — NO existing data is reassigned. `api_credentials.team_id`
stays nullable: NULL means a personal API (the original, unchanged
single-owner flow); a value means a team API governed by roles + grants.
Every existing user/API/token keeps working exactly as before, in what the
app calls "Personal mode".

The only backfill is `proxy_tokens.created_by_user_id`, set to each existing
token's credential owner — behaviorally identical to today, just making the
new NOT NULL column concrete for pre-existing rows.
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # --- new tables --------------------------------------------------------
    op.create_table(
        "teams",
        sa.Column("id", sa.String(36), primary_key=True, default=lambda: str(uuid.uuid4())),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "team_memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "team_id", sa.String(36), sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("team_id", "user_id", name="uq_team_member"),
    )

    op.create_table(
        "api_access_grants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "credential_id", sa.String(36),
            sa.ForeignKey("api_credentials.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column(
            "granted_by_user_id", sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("credential_id", "user_id", name="uq_api_grant"),
    )

    op.create_table(
        "team_invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "team_id", sa.String(36), sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "invited_by_user_id", sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "accepted_by_user_id", sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )

    # --- api_credentials.team_id (nullable — NULL = personal API) ----------
    with op.batch_alter_table("api_credentials") as batch:
        batch.add_column(sa.Column("team_id", sa.String(36), nullable=True))
        batch.create_foreign_key(
            "fk_api_credentials_team_id", "teams", ["team_id"], ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_api_credentials_team_id", ["team_id"])

    # --- proxy_tokens.created_by_user_id (nullable first, backfill, then NOT NULL) --
    with op.batch_alter_table("proxy_tokens") as batch:
        batch.add_column(sa.Column("created_by_user_id", sa.String(36), nullable=True))

    # every existing token was minted by its (personal) credential's owner
    op.execute(
        """
        UPDATE proxy_tokens
        SET created_by_user_id = (
            SELECT user_id FROM api_credentials
            WHERE api_credentials.id = proxy_tokens.credential_id
        )
        """
    )

    with op.batch_alter_table("proxy_tokens") as batch:
        batch.alter_column("created_by_user_id", nullable=False)
        batch.create_foreign_key(
            "fk_proxy_tokens_created_by", "users", ["created_by_user_id"], ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_proxy_tokens_created_by_user_id", ["created_by_user_id"])

    _ = bind  # dialect-agnostic; batch_alter_table already handles SQLite vs Postgres


def downgrade() -> None:
    with op.batch_alter_table("proxy_tokens") as batch:
        batch.drop_constraint("fk_proxy_tokens_created_by", type_="foreignkey")
        batch.drop_index("ix_proxy_tokens_created_by_user_id")
        batch.drop_column("created_by_user_id")

    with op.batch_alter_table("api_credentials") as batch:
        batch.drop_constraint("fk_api_credentials_team_id", type_="foreignkey")
        batch.drop_index("ix_api_credentials_team_id")
        batch.drop_column("team_id")

    op.drop_table("team_invitations")
    op.drop_table("api_access_grants")
    op.drop_table("team_memberships")
    op.drop_table("teams")
