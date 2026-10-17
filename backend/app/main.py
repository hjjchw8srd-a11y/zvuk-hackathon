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
from sqlalchemy import text

from app.config import BACKEND_DIR, settings
from app.database import Base, engine
from app import models as _models  # noqa: F401 — регистрирует модели в metadata
from app.routers import auth, communities, parties, users
from app.routers.communities import manager, ws_community
from app.routers.parties import party_manager, ws_party_endpoint

_ = _models


app = FastAPI(title="ритм. backend", version="1.0.0")


@app.on_event("startup")
async def startup_event():
    try:
        loop = asyncio.get_running_loop()
        manager.set_loop(loop)
        party_manager.set_loop(loop)
    except Exception:
        pass
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print("Tables create_all check:", e)
    try:
        from app.seed import seed_database
        seed_database()
    except Exception as e:
        print("Seed check:", e)


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
