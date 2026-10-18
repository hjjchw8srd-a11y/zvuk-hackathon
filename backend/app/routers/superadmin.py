"""backend/app/routers/superadmin.py

SuperAdmin platform management router:
- System overview & metrics
- All tracks overview with DMCA report count
- Instant DMCA ban & blacklist
- Clear false DMCA reports
- List and manage all communities/rooms
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_superuser
from app.database import get_db
from app.models import (
    BlacklistedTrack,
    ModerationStatus,
    QueueItem,
    QueueItemState,
    Room,
    RoomMember,
    Track,
    User,
)
from app.routers.communities import _uploads_dir, manager

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


@router.get("/overview")
def get_overview(
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Overview platform metrics for SuperAdmin."""
    total_tracks = db.scalar(select(func.count(Track.id))) or 0
    active_rooms = db.scalar(select(func.count(Room.id)).where(Room.is_active.is_(True))) or 0
    total_users = db.scalar(select(func.count(User.id))) or 0
    reported_tracks = db.scalar(select(func.count(Track.id)).where(Track.dmca_reports_count > 0)) or 0
    blacklisted_tracks = db.scalar(select(func.count(BlacklistedTrack.id))) or 0

    return {
        "total_tracks": total_tracks,
        "active_rooms": active_rooms,
        "total_users": total_users,
        "reported_tracks_count": reported_tracks,
        "blacklisted_tracks_count": blacklisted_tracks,
    }


@router.get("/tracks")
def get_all_tracks(
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Get all platform tracks with DMCA reports and moderation details."""
    stmt = (
        select(Track, Room.name.label("room_name"), User.display_name.label("author_name"))
        .join(Room, Room.id == Track.room_id)
        .outerjoin(User, User.id == Track.created_by_user_id)
        .order_by(Track.dmca_reports_count.desc(), Track.created_at.desc())
    )
    rows = db.execute(stmt).all()
    results = []
    for track, room_name, author_name in rows:
        results.append(
            {
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "genre": track.genre,
                "duration_seconds": track.duration_seconds,
                "duration": track.duration,
                "file_hash": track.file_hash or track.checksum_sha256,
                "normalized_signature": track.normalized_signature,
                "license_type": track.license_type,
                "dmca_reports_count": track.dmca_reports_count,
                "is_admin_banned": track.is_admin_banned,
                "admin_banned_by_user_id": track.admin_banned_by_user_id,
                "admin_banned_at": track.admin_banned_at.isoformat() if track.admin_banned_at else None,
                "moderation_status": track.moderation_status.value if hasattr(track.moderation_status, "value") else str(track.moderation_status),
                "source_type": track.source_type.value if hasattr(track.source_type, "value") else str(track.source_type),
                "storage_key": track.storage_key,
                "library_key": track.library_key,
                "room_id": track.room_id,
                "room_name": room_name,
                "created_by_user_id": track.created_by_user_id,
                "created_by_name": author_name or "Неизвестный",
                "audio_url": (
                    f"/api/communities/{track.room_id}/tracks/{track.id}/audio"
                    if track.storage_key
                    else (f"/uploads/{track.library_key}.mp3" if track.library_key else None)
                ),
                "created_at": track.created_at.isoformat() if track.created_at else None,
            }
        )
    return results


@router.delete("/tracks/{track_id}/dmca-ban")
def ban_track_dmca(
    track_id: uuid.UUID,
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Apply a durable platform ban that room moderators cannot undo."""
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Трек не найден")

    f_hash = track.file_hash or track.checksum_sha256 or f"manual-{track.id.hex}"
    norm_sig = track.normalized_signature or f"{track.artist}{track.title}".lower()
    dur = track.duration or float(track.duration_seconds or 0)

    # Add to BlacklistedTrack
    existing_bl = db.scalar(select(BlacklistedTrack).where(BlacklistedTrack.file_hash == f_hash))
    if existing_bl is None:
        bl = BlacklistedTrack(
            file_hash=f_hash,
            normalized_signature=norm_sig,
            duration=dur,
            reason=f"DMCA ban by SuperAdmin for '{track.artist} - {track.title}'",
        )
        db.add(bl)

    # Delete audio file from storage
    if track.storage_key:
        try:
            file_path = _uploads_dir() / track.storage_key
            file_path.unlink(missing_ok=True)
        except Exception:
            pass

    room_id = track.room_id
    track_title = track.title
    track.moderation_status = ModerationStatus.BANNED
    track.is_admin_banned = True
    track.admin_banned_by_user_id = user.id
    track.admin_banned_at = datetime.now(timezone.utc)
    for item in db.scalars(select(QueueItem).where(QueueItem.track_id == track.id)).all():
        item.state = QueueItemState.REMOVED
        item.version += 1
    room = db.get(Room, room_id) if room_id else None
    if room is not None:
        room.queue_version += 1
    db.commit()

    if room_id:
        manager.notify_room(room_id, action="track_banned", extra={"track_id": str(track_id)})

    return {
        "ok": True,
        "message": f"Трек «{track_title}» заблокирован администратором и добавлен в чёрный список DMCA",
    }


@router.post("/tracks/{track_id}/clear-reports")
def clear_track_reports(
    track_id: uuid.UUID,
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Reset DMCA reports counter for a track if reports were false or resolved."""
    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Трек не найден")

    track.dmca_reports_count = 0
    db.commit()
    db.refresh(track)

    return {"ok": True, "dmca_reports_count": 0, "message": "Счётчик жалоб сброшен"}


@router.get("/rooms")
def get_all_rooms(
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all rooms with member and track counts."""
    rooms = db.scalars(select(Room).order_by(Room.created_at.desc())).all()
    results = []
    for r in rooms:
        tracks_count = db.scalar(select(func.count(Track.id)).where(Track.room_id == r.id)) or 0
        members_count = db.scalar(select(func.count(RoomMember.user_id)).where(RoomMember.room_id == r.id)) or 0
        owner = db.get(User, r.owner_id) if r.owner_id else None
        results.append(
            {
                "id": r.id,
                "name": r.name,
                "invite_code": r.invite_code,
                "faculty": r.faculty,
                "is_active": r.is_active,
                "party_is_active": r.party_is_active,
                "owner_id": r.owner_id,
                "owner_name": owner.display_name if owner else "Неизвестен",
                "tracks_count": tracks_count,
                "members_count": members_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return results


@router.delete("/rooms/{room_id}")
def delete_room_admin(
    room_id: uuid.UUID,
    user: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Deactivate or remove room by SuperAdmin."""
    room = db.get(Room, room_id)
    if room is not None:
        room.is_active = False
        db.commit()
        manager.notify_room(room_id, action="community_deleted")
    return {"ok": True, "message": "Комната деактивирована"}
