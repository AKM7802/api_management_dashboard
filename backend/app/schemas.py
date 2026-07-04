"""Pydantic request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Provider = Literal["openai", "anthropic", "custom"]


# --- auth --------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    created_at: datetime


# --- managed APIs --------------------------------------------------------------

class ApiCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: Provider
    base_url: str = Field(min_length=1, max_length=500)
    secret: str = Field(min_length=1, max_length=4096)


class ApiUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    status: Literal["active", "disabled"] | None = None
    secret: str | None = Field(default=None, min_length=1, max_length=4096)


class ApiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    provider: str
    base_url: str
    secret_last4: str
    status: str
    created_at: datetime


# --- proxy tokens ---------------------------------------------------------------

class ProxyTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProxyTokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    token_prefix: str
    status: str
    created_at: datetime
    last_used_at: datetime | None


class ProxyTokenCreated(ProxyTokenOut):
    """Returned exactly once, on creation — includes the raw token."""

    token: str


# --- usage / stats ---------------------------------------------------------------

class StatsBucket(BaseModel):
    bucket: datetime
    requests: int
    total_tokens: int
    avg_latency_ms: float
    errors: int
    cost_usd: float


class StatsSummary(BaseModel):
    requests: int
    total_tokens: int
    error_rate: float
    avg_latency_ms: float
    cost_usd: float


class UsageLogRow(BaseModel):
    ts: datetime
    path: str
    model: str
    status_code: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int
    cost_usd: float
