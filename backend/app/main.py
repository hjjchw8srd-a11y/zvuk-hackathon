"""FastAPI приложение — точка входа.

Включает:
- CORS для фронтенда (localhost:5173, localhost:5174, и любой IP в сети)
- Роутеры: users, communities (треки, голоса, очередь, комнаты)
- Health-check endpoint
- Сервинг загруженных файлов через /uploads/{filename}
"""

import asyncio
import uuid
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, select, text

from app.config import BACKEND_DIR, settings
from app.database import Base, SessionLocal, engine
from app import models as _models  # noqa: F401 — регистрирует модели в metadata
from app.routers import auth, communities, integrations, parties, superadmin, users
from app.routers.communities import manager, ws_community
from app.routers.parties import party_manager, ws_party_endpoint

_ = _models


app = FastAPI(title="ритм. backend", version="1.0.0")


def _ensure_column(conn, table_name: str, column_name: str, definition: str) -> None:
    inspector = inspect(conn)
    if table_name not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name not in columns:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))


def ensure_platform_admin() -> None:
    """Ensure the requested stable platform administrator account exists."""

    from app.auth import get_password_hash
    from app.models import User

    with SessionLocal() as db:
        by_username = db.scalar(select(User).where(User.username == "papa"))
        by_email = db.scalar(select(User).where(User.email == "papa@mail.ru"))
        if by_username is not None and by_email is not None and by_username.id != by_email.id:
            by_email.email = f"papa_archived_{by_email.id.hex[:6]}@mail.ru"
            db.flush()

        admin_user = by_username or by_email
        if admin_user is None:
            admin_user = User(id=uuid.uuid4())
            db.add(admin_user)

        admin_user.username = "papa"
        admin_user.email = "papa@mail.ru"
        admin_user.display_name = "papa"
        admin_user.password_hash = get_password_hash("papa")
        admin_user.is_superuser = True

        # Remove the known development backdoor from earlier versions without
        # deleting an account that may own rooms or tracks.
        legacy_admin = db.scalar(
            select(User).where(User.username == "admin", User.email == "admin@ritm.local")
        )
        if legacy_admin is not None and legacy_admin.id != admin_user.id:
            legacy_admin.is_superuser = False
        db.commit()


@app.on_event("startup")
async def startup_event():
    try:
        loop = asyncio.get_running_loop()
        manager.set_loop(loop)
        party_manager.set_loop(loop)
    except Exception:
        pass

    # 1. Automatic DDL migration for new columns and indexes
    try:
        with engine.begin() as conn:
            _ensure_column(conn, "users", "username", "VARCHAR(60)")
            _ensure_column(conn, "users", "is_superuser", "BOOLEAN DEFAULT FALSE NOT NULL")

            _ensure_column(conn, "tracks", "duration", "DOUBLE PRECISION DEFAULT 0.0 NOT NULL")
            _ensure_column(conn, "tracks", "file_hash", "VARCHAR(64)")
            _ensure_column(conn, "tracks", "normalized_signature", "VARCHAR(255)")
            _ensure_column(conn, "tracks", "license_type", "VARCHAR(100) DEFAULT 'CC / User Upload' NOT NULL")
            _ensure_column(conn, "tracks", "dmca_reports_count", "INTEGER DEFAULT 0 NOT NULL")
            _ensure_column(conn, "tracks", "is_admin_banned", "BOOLEAN DEFAULT FALSE NOT NULL")
            uuid_type = "UUID" if conn.dialect.name == "postgresql" else "CHAR(32)"
            timestamp_type = "TIMESTAMP WITH TIME ZONE" if conn.dialect.name == "postgresql" else "DATETIME"
            _ensure_column(conn, "tracks", "admin_banned_by_user_id", uuid_type)
            _ensure_column(conn, "tracks", "admin_banned_at", timestamp_type)

            if "tracks" in inspect(conn).get_table_names():
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracks_file_hash ON tracks (file_hash);"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracks_normalized_signature ON tracks (normalized_signature);"))
            if "users" in inspect(conn).get_table_names():
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username) WHERE username IS NOT NULL;"))
    except Exception as e:
        print("Startup DDL migration check:", e)

    # 2. Create tables
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print("Tables create_all check:", e)

    # 3. Seed initial database data
    try:
        from app.seed import seed_database
        seed_database()
    except Exception as e:
        print("Seed check:", e)

    # 4. Ensure SuperAdmin user exists
    try:
        ensure_platform_admin()
    except Exception as e:
        print("SuperAdmin seed check:", e)

    from app.integrations.streamerbot import streamerbot_bridge

    streamerbot_bridge.start()


@app.on_event("shutdown")
async def shutdown_event():
    from app.integrations.streamerbot import streamerbot_bridge

    await streamerbot_bridge.stop()


@app.websocket("/ws/communities/{room_id}")
async def root_ws_community(websocket: WebSocket, room_id: uuid.UUID):
    await ws_community(websocket, room_id)


@app.websocket("/ws/parties/{party_id}")
async def root_ws_party(websocket: WebSocket, party_id: uuid.UUID):
    await ws_party_endpoint(websocket, party_id)

# ── CORS ────────────────────────────────────────────────────────────────────
# allow_origins=["*"] + allow_credentials не работают вместе в браузере.
# Используем allow_origin_regex, чтобы принимать запросы с любого хоста
# локальной сети (192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost, 127.0.0.1).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|"
        r"172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)"
        r"(:\d+)?"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Роутеры ─────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(communities.router)
app.include_router(parties.router)
app.include_router(superadmin.router)
app.include_router(integrations.router)


# ── Сервинг загружённых аудиофайлов ─────────────────────────────────────────
def _uploads_dir() -> Path:
    path = settings.uploads_dir
    uploads = path if path.is_absolute() else BACKEND_DIR / path
    uploads.mkdir(parents=True, exist_ok=True)
    return uploads


app.mount("/uploads", StaticFiles(directory=str(_uploads_dir())), name="uploads")


# ── Служебные эндпоинты ──────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
def health():
    """Проверка состояния сервера и БД."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "db": "up"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "db": "down"},
        )
