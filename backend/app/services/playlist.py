"""Transactional playlist operations.

All functions use a synchronous SQLAlchemy ``Session`` and leave committing to
the caller. Operations that change queue ordering lock the room first, so votes,
rotations and player transitions use the same lock order and cannot race each
other into an invalid state.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import (
    ModerationStatus,
    MemberRole,
    PlaybackHistory,
    PlaylistRound,
    QueueItem,
    QueueItemState,
    Room,
    RoomMember,
    RoundStatus,
    RoundTopSnapshot,
    Track,
    User,
    Vote,
    VoteEvent,
)


FAIRNESS_PLAYS_PER_POINT = 2
FAIRNESS_MAX_PENALTY = 3


def fairness_penalty(played_count: int) -> int:
    """Apply one penalty point per two plays, capped so votes stay dominant."""
    if played_count <= 0:
        return 0
    return min(
        FAIRNESS_MAX_PENALTY,
        (played_count + FAIRNESS_PLAYS_PER_POINT - 1) // FAIRNESS_PLAYS_PER_POINT,
    )


class PlaylistError(Exception):
    """Base error for an expected domain conflict."""


class NotFoundError(PlaylistError):
    pass


class ForbiddenError(PlaylistError):
    pass


class ConflictError(PlaylistError):
    pass


@dataclass(frozen=True, slots=True)
class RankedQueueItem:
    queue_item: QueueItem
    track: Track
    upvotes: int
    downvotes: int
    score: int
    fair_score: float
    user_vote: int | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def weekly_round_key(now: datetime | None = None) -> str:
    """Return a stable ISO week identifier such as ``2026-W42``."""

    current = now or utc_now()
    iso_year, iso_week, _ = current.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def _locked_room(session: Session, room_id: uuid.UUID) -> Room:
    room = session.scalar(
        select(Room).where(Room.id == room_id, Room.is_active.is_(True)).with_for_update()
    )
    if room is None:
        raise NotFoundError("Комната не найдена или неактивна")
    return room


def _require_member(
    session: Session, room_id: uuid.UUID, user_id: uuid.UUID
) -> RoomMember:
    membership = session.get(RoomMember, (room_id, user_id))
    if membership is None:
        raise ForbiddenError("Пользователь не состоит в этой комнате")
    return membership


def create_playlist_round(
    session: Session,
    room_id: uuid.UUID,
    created_by_user_id: uuid.UUID,
    *,
    manual: bool = False,
    now: datetime | None = None,
) -> PlaylistRound:
    """Create an idempotent weekly round and copy approved tracks into it.

    The room row is locked for the whole operation. Only one active round may
    exist because the database also enforces a partial unique index.
    """

    current_time = now or utc_now()
    base_key = weekly_round_key(current_time)
    room = _locked_room(session, room_id)
    membership = _require_member(session, room_id, created_by_user_id)
    if manual and membership.role not in (MemberRole.OWNER, MemberRole.MODERATOR):
        raise ForbiddenError("Запустить ручную ротацию может только модератор")

    active_round = session.scalar(
        select(PlaylistRound)
        .where(
            PlaylistRound.room_id == room_id,
            PlaylistRound.status == RoundStatus.ACTIVE,
        )
        .with_for_update()
    )

    if active_round is not None and not manual and active_round.key.startswith(base_key):
        return active_round

    if active_round is not None:
        snapshot_round_top(session, room_id, active_round.id, now=current_time)
        active_round.status = RoundStatus.CLOSED
        active_round.ends_at = current_time

    room.queue_version += 1
    round_key = (
        f"{base_key}:manual:{uuid.uuid4().hex[:8]}" if manual else base_key
    )
    playlist_round = PlaylistRound(
        room_id=room_id,
        key=round_key,
        status=RoundStatus.ACTIVE,
        starts_at=current_time,
        created_by_user_id=created_by_user_id,
    )
    session.add(playlist_round)
    session.flush()

    approved_tracks = session.scalars(
        select(Track)
        .where(
            Track.room_id == room_id,
            Track.moderation_status == ModerationStatus.APPROVED,
        )
        .order_by(Track.created_at, Track.id)
    ).all()
    session.add_all(
        QueueItem(
            room_id=room_id,
            round_id=playlist_round.id,
            track_id=track.id,
            added_by_user_id=track.created_by_user_id,
            state=QueueItemState.QUEUED,
            version=room.queue_version,
        )
        for track in approved_tracks
    )
    session.flush()
    return playlist_round


def cast_vote(
    session: Session,
    queue_item_id: uuid.UUID,
    user_id: uuid.UUID,
    value: int,
) -> int:
    """Create, change or toggle a vote and append an immutable audit event.

    Returns the resulting value: ``-1``, ``1`` or ``0`` when the vote was
    removed by pressing the same button again.
    """

    if value not in (-1, 1):
        raise ValueError("Голос должен быть равен +1 или -1")

    existing_item = session.get(QueueItem, queue_item_id)
    if existing_item is None:
        raise NotFoundError("Элемент очереди не найден")

    room = _locked_room(session, existing_item.room_id)
    queue_item = session.scalar(
        select(QueueItem)
        .join(PlaylistRound, PlaylistRound.id == QueueItem.round_id)
        .where(
            QueueItem.id == queue_item_id,
            QueueItem.state == QueueItemState.QUEUED,
            PlaylistRound.status == RoundStatus.ACTIVE,
        )
        .with_for_update()
    )
    if queue_item is None:
        raise ConflictError("Голосование доступно только для активной очереди")

    _require_member(session, queue_item.room_id, user_id)
    if session.get(User, user_id) is None:
        raise NotFoundError("Пользователь не найден")

    vote = session.scalar(
        select(Vote).where(
            Vote.queue_item_id == queue_item_id,
            Vote.user_id == user_id,
        )
    )
    old_value = vote.value if vote is not None else 0

    if vote is not None and vote.value == value:
        session.delete(vote)
        new_value = 0
    elif vote is not None:
        vote.value = value
        new_value = value
    else:
        session.add(Vote(queue_item_id=queue_item_id, user_id=user_id, value=value))
        new_value = value

    session.add(
        VoteEvent(
            queue_item_id=queue_item_id,
            user_id=user_id,
            old_value=old_value,
            new_value=new_value,
        )
    )
    room.queue_version += 1
    session.flush()
    return new_value


def set_vote(
    session: Session,
    queue_item_id: uuid.UUID,
    user_id: uuid.UUID,
    value: int,
) -> int:
    """Idempotently store the vote state requested by the web client.

    Unlike ``cast_vote`` (a button-toggle helper used by chat commands), this
    operation is safe to retry: sending the same desired value twice cannot
    accidentally remove a vote.
    """

    if value not in (-1, 0, 1):
        raise ValueError("Голос должен быть равен -1, 0 или +1")

    existing_item = session.get(QueueItem, queue_item_id)
    if existing_item is None:
        raise NotFoundError("Элемент очереди не найден")

    room = _locked_room(session, existing_item.room_id)
    queue_item = session.scalar(
        select(QueueItem)
        .join(PlaylistRound, PlaylistRound.id == QueueItem.round_id)
        .where(
            QueueItem.id == queue_item_id,
            QueueItem.state.in_((QueueItemState.QUEUED, QueueItemState.PLAYING)),
            PlaylistRound.status == RoundStatus.ACTIVE,
        )
        .with_for_update()
    )
    if queue_item is None:
        raise ConflictError("Голосование доступно только для активной очереди")

    _require_member(session, queue_item.room_id, user_id)
    if session.get(User, user_id) is None:
        raise NotFoundError("Пользователь не найден")

    vote = session.scalar(
        select(Vote)
        .where(Vote.queue_item_id == queue_item_id, Vote.user_id == user_id)
        .with_for_update()
    )
    old_value = vote.value if vote is not None else 0
    if old_value == value:
        return value

    if value == 0:
        if vote is not None:
            session.delete(vote)
    elif vote is None:
        session.add(Vote(queue_item_id=queue_item_id, user_id=user_id, value=value))
    else:
        vote.value = value

    session.add(
        VoteEvent(
            queue_item_id=queue_item_id,
            user_id=user_id,
            old_value=old_value,
            new_value=value,
        )
    )
    room.queue_version += 1
    session.flush()
    return value


def snapshot_round_top(
    session: Session,
    room_id: uuid.UUID,
    round_id: uuid.UUID,
    *,
    limit: int = 20,
    now: datetime | None = None,
) -> list[RoundTopSnapshot]:
    """Capture final standings of a round into immutable snapshots."""
    current_time = now or utc_now()
    ranked = get_ranked_queue(session, room_id, round_id=round_id, now=current_time)
    snapshots: list[RoundTopSnapshot] = []
    for rank, item in enumerate(ranked[:limit], start=1):
        snapshot = RoundTopSnapshot(
            round_id=round_id,
            room_id=room_id,
            rank=rank,
            track_id=item.track.id,
            track_title=item.track.title,
            track_artist=item.track.artist,
            score=item.score,
            fair_score=item.fair_score,
            created_at=current_time,
        )
        session.add(snapshot)
        snapshots.append(snapshot)
    session.flush()
    return snapshots


def get_ranked_queue(
    session: Session,
    room_id: uuid.UUID,
    *,
    round_id: uuid.UUID | None = None,
    current_user_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> list[RankedQueueItem]:
    """Return the active or specified round queue sorted by fair score and insertion time."""

    if round_id is not None:
        target_round_id = round_id
    else:
        target_round_id = session.scalar(
            select(PlaylistRound.id).where(
                PlaylistRound.room_id == room_id,
                PlaylistRound.status == RoundStatus.ACTIVE,
            )
        )
    if target_round_id is None:
        return []

    vote_stats = (
        select(
            Vote.queue_item_id.label("queue_item_id"),
            func.sum(case((Vote.value == 1, 1), else_=0)).label("upvotes"),
            func.sum(case((Vote.value == -1, 1), else_=0)).label("downvotes"),
        )
        .group_by(Vote.queue_item_id)
        .subquery()
    )

    current_time = now or utc_now()
    start_of_day = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
    played_by_author = (
        select(
            Track.created_by_user_id.label("author_id"),
            func.count(PlaybackHistory.id).label("played_count"),
        )
        .join(QueueItem, QueueItem.id == PlaybackHistory.queue_item_id)
        .join(Track, Track.id == QueueItem.track_id)
        .where(
            QueueItem.room_id == room_id,
            PlaybackHistory.completed_at.is_not(None),
            PlaybackHistory.completed_at >= start_of_day,
            Track.created_by_user_id.is_not(None),
        )
        .group_by(Track.created_by_user_id)
        .subquery()
    )

    user_vote = None
    if current_user_id is not None:
        user_vote = (
            select(Vote.queue_item_id.label("queue_item_id"), Vote.value.label("value"))
            .where(Vote.user_id == current_user_id)
            .subquery()
        )

    columns = [
        QueueItem,
        Track,
        func.coalesce(vote_stats.c.upvotes, 0),
        func.coalesce(vote_stats.c.downvotes, 0),
        func.coalesce(played_by_author.c.played_count, 0),
    ]
    if user_vote is not None:
        columns.append(user_vote.c.value)

    statement = (
        select(*columns)
        .join(Track, Track.id == QueueItem.track_id)
        .outerjoin(vote_stats, vote_stats.c.queue_item_id == QueueItem.id)
        .outerjoin(
            played_by_author,
            played_by_author.c.author_id == Track.created_by_user_id,
        )
        .where(
            QueueItem.round_id == target_round_id,
            QueueItem.state == QueueItemState.QUEUED,
            Track.moderation_status == ModerationStatus.APPROVED,
        )
    )
    if user_vote is not None:
        statement = statement.outerjoin(
            user_vote, user_vote.c.queue_item_id == QueueItem.id
        )

    ranked: list[RankedQueueItem] = []
    for row in session.execute(statement):
        queue_item, track = row[0], row[1]
        upvotes, downvotes, played_count = int(row[2]), int(row[3]), int(row[4])
        score = upvotes - downvotes
        fair_score = float(score - fairness_penalty(played_count))
        ranked.append(
            RankedQueueItem(
                queue_item=queue_item,
                track=track,
                upvotes=upvotes,
                downvotes=downvotes,
                score=score,
                fair_score=fair_score,
                user_vote=int(row[5]) if len(row) > 5 and row[5] is not None else None,
            )
        )

    ranked.sort(
        key=lambda item: (
            -item.fair_score,
            item.queue_item.created_at,
            str(item.queue_item.id),
        )
    )
    return ranked


def complete_current_and_play_next(
    session: Session,
    room_id: uuid.UUID,
    played_by_user_id: uuid.UUID,
    *,
    expected_queue_item_id: uuid.UUID | None = None,
    expected_version: int | None = None,
    now: datetime | None = None,
) -> tuple[QueueItem | None, QueueItem | None]:
    """Atomically complete the current item and select the next ranked item.

    The optional expected ID and version make requests from an outdated audio
    player harmless. The database's partial unique index is the final safeguard
    against two playing items in the same round.
    """

    current_time = now or utc_now()
    room = _locked_room(session, room_id)
    _require_member(session, room_id, played_by_user_id)

    active_round = session.scalar(
        select(PlaylistRound)
        .where(
            PlaylistRound.room_id == room_id,
            PlaylistRound.status == RoundStatus.ACTIVE,
        )
        .with_for_update()
    )
    if active_round is None:
        raise ConflictError("В комнате нет активного раунда")

    current_item = session.scalar(
        select(QueueItem)
        .where(
            QueueItem.round_id == active_round.id,
            QueueItem.state == QueueItemState.PLAYING,
        )
        .with_for_update()
    )
    if current_item is not None:
        if expected_queue_item_id is not None and current_item.id != expected_queue_item_id:
            raise ConflictError("Плеер пытается завершить уже неактуальный трек")
        if expected_version is not None and current_item.version != expected_version:
            raise ConflictError("Версия очереди изменилась")

        current_item.state = QueueItemState.PLAYED
        current_item.completed_at = current_time
        history = session.scalar(
            select(PlaybackHistory).where(
                PlaybackHistory.queue_item_id == current_item.id,
                PlaybackHistory.queue_version == current_item.version,
            )
        )
        if history is None:
            history = PlaybackHistory(
                queue_item_id=current_item.id,
                played_by_user_id=played_by_user_id,
                queue_version=current_item.version,
                started_at=current_item.started_at or current_time,
            )
            session.add(history)
        history.completed_at = current_time

    elif expected_queue_item_id is not None:
        raise ConflictError("Трек уже завершён или очередь была обновлена")

    session.flush()
    ranked = get_ranked_queue(session, room_id, now=current_time)
    next_item = ranked[0].queue_item if ranked else None
    if next_item is not None:
        next_item = session.scalar(
            select(QueueItem).where(QueueItem.id == next_item.id).with_for_update()
        )
        if next_item is None or next_item.state != QueueItemState.QUEUED:
            raise ConflictError("Очередь изменилась, повторите запрос")
        next_item.state = QueueItemState.PLAYING
        next_item.started_at = current_time
        session.add(
            PlaybackHistory(
                queue_item_id=next_item.id,
                played_by_user_id=played_by_user_id,
                queue_version=next_item.version,
                started_at=current_time,
            )
        )

    room.queue_version += 1
    session.flush()
    return current_item, next_item
