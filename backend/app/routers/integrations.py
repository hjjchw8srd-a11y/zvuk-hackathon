"""Configuration/status endpoints for local streaming integrations."""

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.integrations.streamerbot import (
    _configured_room,
    handle_chat_command,
    streamerbot_bridge,
)
from app.models import MemberRole, RoomMember, User


router = APIRouter(prefix="/api/integrations/streamerbot", tags=["integrations"])


class SimulateCommandRequest(BaseModel):
    text: str = Field(min_length=2, max_length=200)


class ConfigureStreamerBotRequest(BaseModel):
    room_code: str | None = None
    enabled: bool | None = None


@router.get("/status")
def streamerbot_status(user: User = Depends(get_current_user)):
    _ = user
    return streamerbot_bridge.snapshot()


@router.post("/config")
async def update_streamerbot_config(
    payload: ConfigureStreamerBotRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.config import settings
    if payload.room_code is not None:
        code = payload.room_code.strip().upper()
        settings.streamerbot_room_code = code
    if payload.enabled is not None:
        settings.streamerbot_enabled = payload.enabled
        if payload.enabled:
            streamerbot_bridge.start()
        else:
            await streamerbot_bridge.stop()
    return streamerbot_bridge.snapshot()


@router.post("/simulate")
def simulate_streamerbot_command(
    payload: SimulateCommandRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = _configured_room(db)
    if room is None:
        raise HTTPException(status_code=409, detail="Сначала настройте комнату Streamer.bot")
    
    membership = db.get(RoomMember, (room.id, user.id))
    if membership is None:
        db.add(RoomMember(room_id=room.id, user_id=user.id, role=MemberRole.MEMBER))
        db.commit()

    result = handle_chat_command(
        db,
        text=payload.text,
        twitch_user_id=f"test-{user.id}",
        user_login=user.username or user.display_name or "viewer",
        user_name=user.display_name or "Viewer",
    )
    return {
        "action": result.action,
        "reply": result.reply,
        "room_id": str(result.room_id) if result.room_id else None,
        "track_id": str(result.track_id) if result.track_id else None,
    }
