"""Configuration for the Eero Dashboard backend."""

import os
import sys
from pathlib import Path

from pydantic import BaseModel, ConfigDict


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

    # VictoriaMetrics (embedded time-series database)
    victoria_metrics_url: str = "http://127.0.0.1:8428"

    # Metrics collector
    collection_interval: int = 60  # seconds

    # eero-api SDK tuning (phase-6.0-revamp.md § 3.1, decision 6)
    sdk_legacy_cookie: bool = False
    sdk_get_retries: int = 1

    # Experimental writes gate (decision 6a) - unverified / settings-class
    # SDK writes are hidden behind this flag until a route opts in.
    experimental_writes: bool = False

    # Account-identity writes gate (SECURITY-SME finding, 2026-09-24):
    # PUT /account/email, PUT /account/phone and their /verify counterparts
    # change the credential eero uses to identify and recover the account.
    # ``experimental_writes`` alone is not a strong enough gate for that -
    # any operator who turns it on for, say, the DHCP screen would also
    # silently expose account takeover-adjacent writes. This is a second,
    # independent flag; both must be on for those four routes.
    account_identity_writes: bool = False

    model_config = ConfigDict(env_prefix="EERO_DASHBOARD_")


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
        # VictoriaMetrics configuration
        victoria_metrics_url=os.environ.get(
            "EERO_DASHBOARD_VICTORIA_METRICS_URL", "http://127.0.0.1:8428"
        ),
        collection_interval=max(
            10, int(os.environ.get("EERO_DASHBOARD_COLLECTION_INTERVAL", "60"))
        ),
        sdk_legacy_cookie=os.environ.get(
            "EERO_DASHBOARD_SDK_LEGACY_COOKIE", "false"
        ).lower()
        == "true",
        # Clamped 0-3 (security review, 2026-09-24): an unbounded retry
        # count from the environment could amplify load against the eero
        # cloud API on every GET failure.
        sdk_get_retries=min(
            3, max(0, int(os.environ.get("EERO_DASHBOARD_SDK_GET_RETRIES", "1")))
        ),
        experimental_writes=os.environ.get(
            "EERO_DASHBOARD_EXPERIMENTAL_WRITES", "false"
        ).lower()
        == "true",
        account_identity_writes=os.environ.get(
            "EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES", "false"
        ).lower()
        == "true",
    )


settings = get_settings()
