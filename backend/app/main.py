from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import Base, engine, get_db
from app import models as _models  # noqa: F401  — регистрирует модели в metadata
from app.routers import users

_ = _models


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # При запуске — создаём таблицы (если ещё не созданы через alembic)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="track-backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Роутеры ─────────────────────────────────────────────────────────────────
app.include_router(users.router)


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
