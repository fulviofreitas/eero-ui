"""FastAPI dependencies for the Eero Dashboard."""

import logging
from pathlib import Path
from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status

# Import eero client from parent package
import sys

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from eero import EeroClient
from eero.exceptions import EeroAuthenticationException

from .config import settings

_LOGGER = logging.getLogger(__name__)

# Global client instance (single account mode)
_client: EeroClient | None = None


async def get_eero_client() -> AsyncGenerator[EeroClient, None]:
    """Get or create the EeroClient instance.

    This dependency provides a shared EeroClient instance.
    The client manages its own session and caching.
    """
    global _client

    if _client is None:
        # Ensure cookie directory exists
        cookie_path = Path(settings.cookie_file)
        cookie_path.parent.mkdir(parents=True, exist_ok=True)

        _client = EeroClient(
            cookie_file=settings.cookie_file,
            use_keyring=False,  # Use file-based storage for dashboard
            cache_timeout=60,
        )
        await _client.__aenter__()
        _LOGGER.info("EeroClient initialized")

    yield _client


async def require_auth(
    client: EeroClient = Depends(get_eero_client),
) -> EeroClient:
    """Dependency that requires authentication.

    Raises HTTPException 401 if not authenticated.
    """
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in first.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return client


async def get_network_id(
    client: EeroClient = Depends(require_auth),
    network_id: str | None = None,
) -> str:
    """Get the network ID to use for operations.

    Uses provided network_id or falls back to preferred network.
    """
    if network_id:
        return network_id

    if client.preferred_network_id:
        return client.preferred_network_id

    # Try to get first network
    try:
        networks = await client.get_networks()
        if networks:
            return networks[0].id
    except EeroAuthenticationException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No network available. Please specify network_id.",
    )


async def shutdown_client() -> None:
    """Shutdown the EeroClient on application shutdown."""
    global _client
    if _client is not None:
        await _client.__aexit__(None, None, None)
        _client = None
        _LOGGER.info("EeroClient shutdown complete")
