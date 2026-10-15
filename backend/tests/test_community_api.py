from __future__ import annotations

import io
from pathlib import Path
import tempfile
import unittest
import wave

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.config import settings


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

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        settings.uploads_dir = self.original_uploads_dir
        self.uploads_tempdir.cleanup()

    @staticmethod
    def _wav_bytes() -> bytes:
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(8000)
            audio.writeframes(b"\x00\x00" * 800)
        return output.getvalue()

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
        self.assertIn("повреждён", uploaded.json()["detail"])
        self.assertEqual(list(settings.uploads_dir.iterdir()), [])

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


if __name__ == "__main__":
    unittest.main()
