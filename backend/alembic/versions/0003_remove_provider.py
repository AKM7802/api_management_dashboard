"""Drop api_credentials.provider — registering an API no longer declares one.

The proxy now injects the secret via every common auth convention
(Authorization: Bearer + x-api-key) instead of branching on a stored
provider, and cost estimation keys off the model name reported by the
upstream response rather than a (provider, model) pair. There is nothing
left that reads this column.
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("api_credentials") as batch:
        batch.drop_column("provider")


def downgrade() -> None:
    with op.batch_alter_table("api_credentials") as batch:
        batch.add_column(sa.Column("provider", sa.String(40), nullable=False, server_default="custom"))
