"""Audio recognition through the reverse-engineered Shazam client."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass


class RecognitionError(Exception):
    """Base class for errors safe to translate into an API response."""


class RecognitionNotFound(RecognitionError):
    pass


class RecognitionUnavailable(RecognitionError):
    pass


@dataclass(frozen=True)
class RecognizedTrack:
    title: str
    artist: str
    genre: str
    cover_url: str | None
    shazam_url: str | None


async def recognize_audio(content: bytes) -> RecognizedTrack:
    try:
        from shazamio import Shazam
    except ImportError as error:
        raise RecognitionUnavailable(
            "Модуль распознавания не установлен на сервере"
        ) from error

    try:
        shazam = Shazam(language="ru-RU", endpoint_country="RU")
        payload = await asyncio.wait_for(shazam.recognize(content), timeout=30)
    except asyncio.TimeoutError as error:
        raise RecognitionUnavailable("Shazam не ответил за 30 секунд") from error
    except Exception as error:
        raise RecognitionUnavailable("Сервис Shazam временно недоступен") from error

    track = payload.get("track") if isinstance(payload, dict) else None
    if not isinstance(track, dict):
        raise RecognitionNotFound("Shazam не узнал эту запись")

    title = str(track.get("title") or "").strip()
    artist = str(track.get("subtitle") or "").strip()
    if not title:
        raise RecognitionNotFound("Shazam не узнал эту запись")

    images = track.get("images") if isinstance(track.get("images"), dict) else {}
    genres = track.get("genres") if isinstance(track.get("genres"), dict) else {}
    return RecognizedTrack(
        title=title,
        artist=artist,
        genre=str(genres.get("primary") or "").strip(),
        cover_url=images.get("coverarthq") or images.get("coverart"),
        shazam_url=track.get("url"),
    )
