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
    uploads_dir: Path = BACKEND_DIR / "uploads"


settings = Settings()
