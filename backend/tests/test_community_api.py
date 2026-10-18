from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.config import settings
from app.auth import get_current_user
from app.models import PartySession, User
import uuid


class CommunityApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_uploads_dir = settings.uploads_dir
        self.uploads_tempdir = tempfile.TemporaryDirectory()
        settings.uploads_dir = Path(self.uploads_tempdir.name)
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(self.engine, "connect")
        def configure_sqlite(dbapi_connection, _connection_record) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")
            dbapi_connection.create_function("char_length", 1, len)

        Base.metadata.create_all(self.engine)

        def override_db():
            with Session(self.engine) as session:
                try:
                    yield session
                finally:
                    session.close()

        self.test_user_id = uuid.uuid4()
        with Session(self.engine) as session:
            test_user = User(
                id=self.test_user_id,
                email="tester@test.com",
                display_name="Tester",
                username="tester",
                is_superuser=True,
            )
            session.add(test_user)
            session.commit()

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: User(
            id=self.test_user_id,
            email="tester@test.com",
            display_name="Tester",
            username="tester",
            is_superuser=True,
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        settings.uploads_dir = self.original_uploads_dir
        self.uploads_tempdir.cleanup()

    @staticmethod
    def _wav_bytes(duration_seconds: float = 0.1, sample_rate: int = 8000) -> bytes:
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(sample_rate)
            audio.writeframes(b"\x00\x00" * round(duration_seconds * sample_rate))
        return output.getvalue()

    @staticmethod
    def _mp3_bytes_with_large_id3_tag() -> bytes:
        tag = b"\x00" * 5000
        size = len(tag)
        synchsafe_size = bytes(
            ((size >> 21) & 0x7F, (size >> 14) & 0x7F, (size >> 7) & 0x7F, size & 0x7F)
        )
        id3 = b"ID3\x04\x00\x00" + synchsafe_size + tag
        mp3_frame = b"\xFF\xFB\x90\x64" + b"\x00" * 413
        return id3 + mp3_frame * 40

    def _create_room(self) -> str:
        created = self.client.post(
            "/api/communities",
            json={"name": "Тестовая группа", "faculty": "ФКН"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        return created.json()["id"]

    def test_uploaded_audio_is_validated_and_streamed_with_ranges(self) -> None:
        room_id = self._create_room()
        content = self._wav_bytes()
        uploaded = self.client.post(
            f"/api/communities/{room_id}/tracks/upload",
            data={"title": "Тестовый звук", "artist": "Волна"},
            files={"file": ("tone.wav", content, "audio/wav")},
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        self.assertEqual(uploaded.json()["duration_seconds"], 1)
        track_id = uploaded.json()["id"]

        audio = self.client.get(
            f"/api/communities/{room_id}/tracks/{track_id}/audio"
        )
        self.assertEqual(audio.status_code, 200, audio.text)
        self.assertEqual(audio.content, content)
        self.assertTrue(audio.headers["content-type"].startswith("audio/wav"))
        self.assertTrue(audio.headers["content-disposition"].startswith("inline"))
        self.assertEqual(audio.headers.get("accept-ranges"), "bytes")

        partial = self.client.get(
            f"/api/communities/{room_id}/tracks/{track_id}/audio",
            headers={"Range": "bytes=0-31"},
        )
        self.assertEqual(partial.status_code, 206, partial.text)
        self.assertEqual(partial.content, content[:32])
        self.assertEqual(partial.headers["content-range"], f"bytes 0-31/{len(content)}")

    def test_upload_rejects_file_with_fake_audio_extension(self) -> None:
        room_id = self._create_room()
        uploaded = self.client.post(
            f"/api/communities/{room_id}/tracks/upload",
            files={"file": ("not-music.mp3", b"this is not audio" * 20, "audio/mpeg")},
        )
        self.assertEqual(uploaded.status_code, 400, uploaded.text)
        self.assertIn("не сможет воспроизвести", uploaded.json()["detail"])
        self.assertEqual(list(settings.uploads_dir.iterdir()), [])

    def test_upload_rejects_hls_playlist_disguised_as_mp3(self) -> None:
        room_id = self._create_room()
        playlist = b"ID3\x03\x00\x00\x00\x00\x00\x00#EXTM3U\n#EXT-X-VERSION:7\n" + b"x" * 200
        uploaded = self.client.post(
            f"/api/communities/{room_id}/tracks/upload",
            files={"file": ("stream.mp3", playlist, "audio/mpeg")},
        )
        self.assertEqual(uploaded.status_code, 400, uploaded.text)
        self.assertIn("HLS-плейлист", uploaded.json()["detail"])
        self.assertEqual(list(settings.uploads_dir.iterdir()), [])

    def test_upload_detects_format_from_content_not_extension(self) -> None:
        room_id = self._create_room()
        content = self._wav_bytes()
        uploaded = self.client.post(
            f"/api/communities/{room_id}/tracks/upload",
            files={"file": ("mistaken.mp3", content, "audio/mpeg")},
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        self.assertEqual(uploaded.json()["format"], "wav")
        stored = list(settings.uploads_dir.iterdir())
        self.assertEqual(len(stored), 1)
        self.assertEqual(stored[0].suffix, ".wav")

    def test_upload_accepts_mp3_after_large_id3_metadata(self) -> None:
        room_id = self._create_room()
        uploaded = self.client.post(
            f"/api/communities/{room_id}/tracks/upload",
            files={
                "file": (
                    "tagged.mp3",
                    self._mp3_bytes_with_large_id3_tag(),
                    "audio/mpeg",
                )
            },
        )
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        self.assertEqual(uploaded.json()["format"], "mp3")

    def test_upload_rejects_audio_longer_than_twenty_minutes(self) -> None:
        room_id = self._create_room()
        content = self._wav_bytes(duration_seconds=1201, sample_rate=8)
        uploaded = self.client.post(
            f"/api/communities/{room_id}/tracks/upload",
            files={"file": ("too-long.wav", content, "audio/wav")},
        )
        self.assertEqual(uploaded.status_code, 413, uploaded.text)
        self.assertIn("20 минут", uploaded.json()["detail"])
        self.assertEqual(list(settings.uploads_dir.iterdir()), [])

    def test_bootstrap_exposes_lan_url_for_qr_invite(self) -> None:
        with patch(
            "app.routers.communities.frontend_base_url",
            return_value="http://192.168.1.42:5173",
        ):
            bootstrap = self.client.get("/api/bootstrap")
        self.assertEqual(bootstrap.status_code, 200)
        self.assertEqual(
            bootstrap.json()["sharing"]["base_url"],
            "http://192.168.1.42:5173",
        )

    def test_frontend_happy_path(self) -> None:
        bootstrap = self.client.get("/api/bootstrap")
        self.assertEqual(bootstrap.status_code, 200)
        self.assertEqual(bootstrap.json()["communities"], [])

        profile = self.client.patch(
            "/api/profile", json={"display_name": "Лена"}
        )
        self.assertEqual(profile.status_code, 200)

        created = self.client.post(
            "/api/communities",
            json={
                "name": "Тестовая группа",
                "faculty": "ФКН",
                "description": "Общий плейлист",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        room_id = created.json()["id"]

        added = self.client.post(
            f"/api/communities/{room_id}/tracks/library", json={"key": "dawn"}
        )
        self.assertEqual(added.status_code, 201, added.text)
        track_id = added.json()["id"]
        self.assertEqual(added.json()["status"], "approved")

        state = self.client.get(f"/api/communities/{room_id}")
        self.assertEqual(state.status_code, 200, state.text)
        self.assertEqual(state.json()["stats"]["queued"], 1)
        self.assertEqual(state.json()["tracks"][0]["title"], "Первые лучи")

        vote = self.client.post(
            f"/api/communities/{room_id}/tracks/{track_id}/vote",
            json={"value": 1},
        )
        self.assertEqual(vote.status_code, 200, vote.text)
        self.assertEqual(vote.json()["value"], 1)

        play = self.client.post(
            f"/api/communities/{room_id}/tracks/{track_id}/play", json={}
        )
        self.assertEqual(play.status_code, 200, play.text)

        complete = self.client.post(
            f"/api/communities/{room_id}/tracks/{track_id}/complete",
            json={"queue_version": play.json()["queue_version"]},
        )
        self.assertEqual(complete.status_code, 200, complete.text)
        self.assertTrue(complete.json()["completed"])

        history = self.client.get(f"/api/communities/{room_id}/history")
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(len(history.json()["votes"]), 1)
        self.assertEqual(len(history.json()["plays"]), 1)

    def test_pause_keeps_current_track_and_resume_keeps_position(self) -> None:
        room_id = self._create_room()
        added = self.client.post(
            f"/api/communities/{room_id}/tracks/library", json={"key": "dawn"}
        )
        track_id = added.json()["id"]

        played = self.client.post(f"/api/communities/{room_id}/tracks/{track_id}/play")
        self.assertEqual(played.status_code, 200, played.text)
        paused = self.client.post(f"/api/communities/{room_id}/tracks/{track_id}/pause")
        self.assertEqual(paused.status_code, 200, paused.text)

        state = self.client.get(f"/api/communities/{room_id}")
        self.assertEqual(state.status_code, 200, state.text)
        self.assertEqual(state.json()["playback"]["current_track_id"], track_id)
        self.assertEqual(state.json()["playback"]["state"], "paused")

        resumed = self.client.post(f"/api/communities/{room_id}/tracks/{track_id}/play")
        self.assertEqual(resumed.status_code, 200, resumed.text)
        self.assertEqual(resumed.json()["state"], "playing")
        self.assertGreaterEqual(resumed.json()["elapsed_seconds"], paused.json()["elapsed_seconds"])

    def test_party_playback_timeline_survives_process_memory_loss(self) -> None:
        created = self.client.post("/api/parties/create", json={"title": "Тестовый эфир"})
        self.assertEqual(created.status_code, 200, created.text)
        party_id = created.json()["party_id"]

        initial_state = self.client.get(f"/api/parties/{party_id}/state")
        self.assertEqual(initial_state.status_code, 200, initial_state.text)
        track_id = initial_state.json()["tracks"][0]["id"]

        played = self.client.post(f"/api/parties/{party_id}/tracks/{track_id}/play")
        self.assertEqual(played.status_code, 200, played.text)

        # Simulate time passing and a backend restart: the durable database
        # fields must be sufficient even when the old process dictionary is empty.
        with Session(self.engine) as session:
            party = session.get(PartySession, uuid.UUID(party_id))
            party.playback_started_at = datetime.now(timezone.utc) - timedelta(seconds=3)
            session.commit()

        from app.routers.parties import party_manager

        party_manager.playback_starts.clear()
        running_state = self.client.get(f"/api/parties/{party_id}/state")
        self.assertGreaterEqual(running_state.json()["playback"]["elapsed_seconds"], 2.5)

        paused = self.client.post(f"/api/parties/{party_id}/tracks/{track_id}/pause")
        self.assertEqual(paused.status_code, 200, paused.text)
        paused_at = paused.json().get("elapsed_seconds")
        state_after_pause = self.client.get(f"/api/parties/{party_id}/state").json()
        self.assertEqual(state_after_pause["playback"]["state"], "paused")
        self.assertAlmostEqual(state_after_pause["playback"]["elapsed_seconds"], paused_at, delta=0.1)

        resumed = self.client.post(f"/api/parties/{party_id}/tracks/{track_id}/play")
        self.assertEqual(resumed.status_code, 200, resumed.text)
        self.assertGreaterEqual(resumed.json()["elapsed_seconds"], paused_at)

    def test_platform_admin_ban_cannot_be_reverted_by_room_moderator(self) -> None:
        room_id = self._create_room()
        added = self.client.post(
            f"/api/communities/{room_id}/tracks/library", json={"key": "dawn"}
        )
        track_id = added.json()["id"]

        banned = self.client.delete(f"/api/superadmin/tracks/{track_id}/dmca-ban")
        self.assertEqual(banned.status_code, 200, banned.text)

        app.dependency_overrides[get_current_user] = lambda: User(
            id=self.test_user_id,
            email="tester@test.com",
            display_name="Tester",
            username="tester",
            is_superuser=False,
        )
        restored = self.client.post(
            f"/api/communities/{room_id}/tracks/{track_id}/moderate",
            json={"action": "restore"},
        )
        self.assertEqual(restored.status_code, 403, restored.text)
        self.assertIn("модератор не может", restored.json()["detail"])


if __name__ == "__main__":
    unittest.main()
