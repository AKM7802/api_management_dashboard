"""Environment-driven settings (12-factor). All values overridable via env vars."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# NOTE: dev-only fallbacks. Set real values via env vars in any shared/prod deployment.
_DEV_JWT_SECRET = "dev-jwt-secret-change-me-0123456789abcdef"
# A valid Fernet key (urlsafe base64, 32 bytes). Dev fallback only.
_DEV_ENCRYPTION_KEY = "sVjcTDvSDGY31PdB53wS_2mQe0j6IWlZFsGwzZBs2xE="


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # transactional store (PostgreSQL in prod, SQLite acceptable for local dev/tests)
    database_url: str = "sqlite:///./dev.db"
    # analytical store (embedded file)
    duckdb_path: str = "./usage.duckdb"

    jwt_secret: str = _DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24h

    # Fernet key used to encrypt upstream API keys at rest
    encryption_key: str = _DEV_ENCRYPTION_KEY

    # proxy behaviour
    proxy_token_cache_ttl_seconds: int = 30
    upstream_timeout_seconds: float = 120.0
    usage_flush_interval_seconds: float = 1.0
    usage_flush_batch_size: int = 100


@lru_cache
def get_settings() -> Settings:
    return Settings()
