"""Configuration for the Eero Dashboard backend."""

import os
import sys
from pathlib import Path

from pydantic import BaseModel


class Settings(BaseModel):
    """Application settings loaded from environment variables."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # Eero client
    cookie_file: str = str(Path.home() / ".eero-dashboard" / "session.json")

    # Session (secret is required - no default)
    session_secret: str
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
    """Get application settings from environment.

    Raises:
        SystemExit: If required environment variables are not set.
    """
    # Session secret is required - no weak defaults
    session_secret = os.environ.get("EERO_DASHBOARD_SESSION_SECRET", "")

    if not session_secret:
        print(
            "ERROR: EERO_DASHBOARD_SESSION_SECRET environment variable is required.\n"
            "Generate a secure secret with: openssl rand -hex 32",
            file=sys.stderr,
        )
        sys.exit(1)

    # Warn if using an obviously weak secret
    weak_secrets = [
        "change-me-in-production",
        "change-me-in-production-use-32-bytes",
        "secret",
        "password",
    ]
    if session_secret.lower() in weak_secrets or len(session_secret) < 32:
        print(
            "WARNING: Session secret appears weak. "
            "Generate a secure secret with: openssl rand -hex 32",
            file=sys.stderr,
        )

    return Settings(
        host=os.environ.get("EERO_DASHBOARD_HOST", "0.0.0.0"),
        port=int(os.environ.get("EERO_DASHBOARD_PORT", "8000")),
        debug=os.environ.get("EERO_DASHBOARD_DEBUG", "false").lower() == "true",
        cookie_file=os.environ.get(
            "EERO_DASHBOARD_COOKIE_FILE",
            str(Path.home() / ".eero-dashboard" / "session.json"),
        ),
        session_secret=session_secret,
    )


settings = get_settings()
