from __future__ import annotations

import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


class CommunityApiTests(unittest.TestCase):
    def setUp(self) -> None:
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
