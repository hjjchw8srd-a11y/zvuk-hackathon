"""Database seeding script for frontend debugging and demo data."""

from __future__ import annotations

import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import SessionLocal
from app.models import (
    MemberRole,
    ModerationStatus,
    QueueItem,
    QueueItemState,
    Room,
    RoomMember,
    Track,
    TrackSource,
    User,
    Vote,
    VoteEvent,
)
from app.routers.communities import LIBRARY
from app.services import create_playlist_round


def seed_database():
    print("[*] Проверка и подготовка демонстрационных данных...")
    db: Session = SessionLocal()
    try:
        # 1. Проверяем или создаем демо-пользователя
        demo_email = "demo@zvuk.local"
        user = db.scalar(select(User).where(User.email == demo_email))
        if user is None:
            user = User(
                email=demo_email,
                password_hash=hash_password("DemoPassword123!"),
                display_name="Студент СПбГУ",
                avatar_url="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
            )
            db.add(user)
            db.flush()
            print(f"   [+] Создан демо-пользователь: {demo_email}")
        else:
            print(f"   [i] Демо-пользователь уже существует: {demo_email}")

        # 2. Создаем демо-плейлист (комнату)
        demo_room_name = "ИИНОД-82"
        room = db.scalar(select(Room).where(Room.name == demo_room_name))
        if room is None:
            room = Room(
                name=demo_room_name,
                faculty="ИИНОД-82",
                description="Главный плейлист базового сообщества ИИНОД-82: предлагайте треки, голосуйте и слушайте вместе!",
                avatar_url="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500",
                external_link="https://zvuk.com",
                invite_code="ZVUK26",
                owner_id=user.id,
            )
            db.add(room)
            db.flush()
            db.add(RoomMember(room_id=room.id, user_id=user.id, role=MemberRole.OWNER))
            db.flush()
            print(f"   [+] Создана комната: '{demo_room_name}' (инвайт-код: ZVUK26)")
        else:
            print(f"   [i] Демо-комната уже существует: '{demo_room_name}'")

        # 3. Создаем активную ротацию
        round_obj = create_playlist_round(db, room.id, user.id)
        db.flush()

        # 4. Добавляем 5 треков из библиотеки
        tracks_to_add = LIBRARY[:5]
        created_tracks = []
        for item in tracks_to_add:
            existing_track = db.scalar(
                select(Track).where(Track.room_id == room.id, Track.library_key == item["key"])
            )
            if existing_track is None:
                track = Track(
                    room_id=room.id,
                    title=item["title"],
                    artist=item["artist"],
                    genre=item["genre"],
                    duration_seconds=item["duration_seconds"],
                    source_type=TrackSource.LIBRARY,
                    library_key=item["key"],
                    moderation_status=ModerationStatus.APPROVED,
                    created_by_user_id=user.id,
                )
                db.add(track)
                db.flush()
                created_tracks.append(track)

                # Добавляем в очередь раунда
                q_item = QueueItem(
                    room_id=room.id,
                    round_id=round_obj.id,
                    track_id=track.id,
                    added_by_user_id=user.id,
                    state=QueueItemState.QUEUED,
                    version=room.queue_version,
                )
                db.add(q_item)
                db.flush()

                # Добавим голос за первые треки для демонстрации ранжирования
                if len(created_tracks) <= 2:
                    db.add(Vote(queue_item_id=q_item.id, user_id=user.id, value=1))
                    db.add(VoteEvent(queue_item_id=q_item.id, user_id=user.id, old_value=0, new_value=1))

        db.commit()
        print(f"   [v] Успешно синхронизировано {len(created_tracks)} треков в очередь.")
    except Exception as e:
        db.rollback()
        print(f"   [!] Предупреждение при заполнении: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
