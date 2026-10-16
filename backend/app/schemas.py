import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserOut(BaseModel):
    id: uuid.UUID
    display_name: str | None
    email: str | None = None
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Minimal user info exposed to other community members."""
    id: uuid.UUID
    display_name: str | None
    avatar_url: str | None = None

    model_config = {"from_attributes": True}


# ── Auth Schemas ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(min_length=2, max_length=60)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Community / Room Schemas ────────────────────────────────────────────────

class CommunityOut(BaseModel):
    id: uuid.UUID
    name: str
    faculty: str
    description: str
    avatar_url: str | None = None
    external_link: str | None = None
    created_at: datetime
    role: str
    member_count: int

    model_config = {"from_attributes": True}


class CommunityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=70)
    faculty: str | None = Field(default=None, max_length=90)
    description: str | None = Field(default=None, max_length=260)
    avatar_url: str | None = Field(default=None, max_length=500)
    external_link: str | None = Field(default=None, max_length=500)


# ── Track Schemas ───────────────────────────────────────────────────────────

class TrackOut(BaseModel):
    id: uuid.UUID
    title: str
    artist: str
    genre: str
    duration_seconds: int
    source_type: str
    room_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Top History Schemas ─────────────────────────────────────────────────────

class TopSnapshotEntry(BaseModel):
    rank: int
    track_id: uuid.UUID | None
    track_title: str
    track_artist: str
    score: int
    fair_score: float

    model_config = {"from_attributes": True}


class RoundTopHistory(BaseModel):
    round_id: uuid.UUID
    round_key: str
    starts_at: datetime
    ends_at: datetime | None
    top: list[TopSnapshotEntry]


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=60)
    avatar_url: str | None = Field(default=None, max_length=500)
