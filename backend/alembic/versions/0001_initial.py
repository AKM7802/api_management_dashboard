"""Initial schema: users, api_credentials, proxy_tokens.

Uses Base.metadata for the initial migration so it can never drift from the
models. Future migrations should use explicit alembic ops.
"""

from alembic import op

from app import models  # noqa: F401  (register models on Base)
from app.db.postgres import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
