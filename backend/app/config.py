"""Configuration for the Eero Dashboard backend."""

import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel


class Settings(BaseModel):
    """Application settings loaded from environment variables."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Eero client
    cookie_file: str = str(Path.home() / ".eero-dashboard" / "session.json")

    # Session
    session_secret: str = os.environ.get(
        "SESSION_SECRET", "change-me-in-production-use-32-bytes"
    )
    session_max_age: int = 86400  # 24 hours

    # CORS (for development)
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds

    class Config:
        """Pydantic config."""

        env_prefix = "EERO_DASHBOARD_"


def get_settings() -> Settings:
    """Get application settings from environment."""
    return Settings(
        host=os.environ.get("EERO_DASHBOARD_HOST", "0.0.0.0"),
        port=int(os.environ.get("EERO_DASHBOARD_PORT", "8000")),
        debug=os.environ.get("EERO_DASHBOARD_DEBUG", "false").lower() == "true",
        cookie_file=os.environ.get(
            "EERO_DASHBOARD_COOKIE_FILE",
            str(Path.home() / ".eero-dashboard" / "session.json"),
        ),
        session_secret=os.environ.get(
            "EERO_DASHBOARD_SESSION_SECRET", "change-me-in-production-use-32-bytes"
        ),
    )


settings = get_settings()
