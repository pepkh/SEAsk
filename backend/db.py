import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv(Path(__file__).parent / ".env")


@lru_cache
def get_engine():
    url = os.environ.get("NEON_URL")
    if not url:
        raise RuntimeError("NEON_URL is not set. Copy .env.example to .env and fill it in.")
    return create_engine(
        url.replace("postgresql://", "postgresql+psycopg2://", 1),
        pool_pre_ping=True,  # reconnect after Neon scales to zero
    )
