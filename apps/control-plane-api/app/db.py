import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import get_settings

Base = declarative_base()

_engine = None
_SessionLocal = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        settings = get_settings()
        database_url = settings.database_url or os.getenv("CONTROL_PLANE_DATABASE_URL", "")
        if not database_url:
            raise RuntimeError("DATABASE_URL is not configured")
        _engine = create_engine(database_url, future=True)
        _SessionLocal = sessionmaker(bind=_engine, class_=Session, expire_on_commit=False)
    return _engine


def get_session():
    if _SessionLocal is None:
        get_engine()
    session = _SessionLocal()
    try:
        yield session
    finally:
        session.close()
