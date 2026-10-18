from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = 8000
    database_url: str = "postgresql+psycopg2://track:track@localhost:5432/track"
    session_secret: str = "local-development-secret-change-me"
    jwt_secret: str = "jwt-dev-secret-change-me-in-production"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    uploads_dir: Path = BACKEND_DIR / "uploads"
    app_base_url: str = ""
    frontend_port: int = 5173
    streamerbot_enabled: bool = True
    streamerbot_ws_url: str = "ws://127.0.0.1:8080/"
    streamerbot_password: str = "ggtthh890"
    streamerbot_room_id: str = ""
    streamerbot_room_code: str = ""
    streamerbot_command_prefix: str = "!"
    twitch_channel: str = "scruffy892"


settings = Settings()
