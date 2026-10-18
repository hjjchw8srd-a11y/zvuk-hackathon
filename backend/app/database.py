from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine_kwargs = {"pool_pre_ping": True}
if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 30,
        "pool_timeout": 30,
    })

engine = create_engine(settings.database_url, **engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema_columns() -> None:
    """Ensure all required tables and columns exist in PostgreSQL or SQLite before any query."""
    from sqlalchemy import inspect, text

    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception as e:
        print("[!] ensure_schema_columns create_all note:", e)

    try:
        with engine.begin() as conn:
            inspector = inspect(conn)
            tables = inspector.get_table_names()

            is_pg = conn.dialect.name == "postgresql"
            bool_type = "BOOLEAN DEFAULT FALSE NOT NULL" if is_pg else "INTEGER DEFAULT 0 NOT NULL"
            uuid_type = "UUID" if is_pg else "CHAR(32)"
            ts_type = "TIMESTAMP WITH TIME ZONE" if is_pg else "DATETIME"
            float_type = "DOUBLE PRECISION DEFAULT 0.0 NOT NULL" if is_pg else "FLOAT DEFAULT 0.0 NOT NULL"

            if "tracks" in tables:
                track_cols = {c["name"] for c in inspector.get_columns("tracks")}
                if "is_admin_banned" not in track_cols:
                    conn.execute(text(f"ALTER TABLE tracks ADD COLUMN is_admin_banned {bool_type};"))
                if "admin_banned_by_user_id" not in track_cols:
                    conn.execute(text(f"ALTER TABLE tracks ADD COLUMN admin_banned_by_user_id {uuid_type};"))
                if "admin_banned_at" not in track_cols:
                    conn.execute(text(f"ALTER TABLE tracks ADD COLUMN admin_banned_at {ts_type};"))
                if "duration" not in track_cols:
                    conn.execute(text(f"ALTER TABLE tracks ADD COLUMN duration {float_type};"))
                if "file_hash" not in track_cols:
                    conn.execute(text("ALTER TABLE tracks ADD COLUMN file_hash VARCHAR(64);"))
                if "normalized_signature" not in track_cols:
                    conn.execute(text("ALTER TABLE tracks ADD COLUMN normalized_signature VARCHAR(255);"))
                if "license_type" not in track_cols:
                    conn.execute(text("ALTER TABLE tracks ADD COLUMN license_type VARCHAR(100) DEFAULT 'CC / User Upload' NOT NULL;"))
                if "dmca_reports_count" not in track_cols:
                    conn.execute(text("ALTER TABLE tracks ADD COLUMN dmca_reports_count INTEGER DEFAULT 0 NOT NULL;"))

            if "users" in tables:
                user_cols = {c["name"] for c in inspector.get_columns("users")}
                if "username" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(60);"))
                if "is_superuser" not in user_cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN is_superuser {bool_type};"))
    except Exception as e:
        print("[!] ensure_schema_columns note:", e)


