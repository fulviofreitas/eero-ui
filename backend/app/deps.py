"""FastAPI dependencies for the Eero Dashboard."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from eero import EeroClient
from eero.api.links import validate_identifier
from eero.exceptions import EeroAuthenticationException, EeroValidationException
from fastapi import Depends, HTTPException, status

from .config import settings
from .transformers import extract_id_from_url, extract_list

_LOGGER = logging.getLogger(__name__)

# Global client instance (single account mode)
_client: EeroClient | None = None

# Guards the first construction of the singleton so two concurrent first
# requests can never build two EeroClient instances (phase-6.0-revamp.md
# § 3.1).
_client_lock = asyncio.Lock()


async def get_eero_client() -> AsyncGenerator[EeroClient, None]:
    """Get or create the EeroClient instance.

    This dependency provides a shared EeroClient instance.
    The client manages its own session and caching.
    """
    global _client

    if _client is None:
        async with _client_lock:
            if _client is None:
                # Ensure cookie directory exists
                cookie_path = Path(settings.cookie_file)
                cookie_path.parent.mkdir(parents=True, exist_ok=True)

                new_client = EeroClient(
                    cookie_file=settings.cookie_file,
                    use_keyring=False,  # Pinned invariant (§ 1.2b): keeps
                    # eero-ui on the single-backend FileStorage path, never
                    # ChainedStorage. Not configurable.
                    cache_timeout=60,
                    send_legacy_cookie=settings.sdk_legacy_cookie,
                    get_retries=settings.sdk_get_retries,
                )
                await new_client.__aenter__()
                _client = new_client
                _LOGGER.info("EeroClient initialized")

    yield _client


async def require_auth(
    client: EeroClient = Depends(get_eero_client),
) -> EeroClient:
    """Dependency that requires authentication.

    Raises HTTPException 401 if not authenticated.

    Note: this is deliberately the cheap "a token exists on disk" gate.
    It does not probe the account endpoint - that is ``/auth/status``'s
    job (see ``routes/auth.py`` and phase-6.0-revamp.md § 4.1).
    """
    if not client.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in first.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return client


class ExperimentalWriteDisabledError(Exception):
    """Raised by ``require_experimental_writes`` when the gate is closed.

    A dedicated exception (rather than raising ``HTTPException`` directly)
    so ``main.py`` can register one handler that puts
    ``type: "experimental_disabled"`` at the top level of the JSON body -
    the shape every other typed-error response in this API uses (see
    ``EeroPremiumRequiredException``'s handler) - rather than nesting it
    under FastAPI's default ``{"detail": ...}`` wrapper.
    """


async def require_experimental_writes() -> None:
    """Dependency gating unverified / settings-class writes (decision 6a,
    WP7): every route classed **Unverified, non-settings** or
    **settings-class** in phase-6.0-revamp.md § 5 depends on this.

    Raises ``ExperimentalWriteDisabledError`` (mapped to 403 by the handler
    in ``main.py``) unless ``EERO_DASHBOARD_EXPERIMENTAL_WRITES`` is set.
    """
    if not settings.experimental_writes:
        raise ExperimentalWriteDisabledError()


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
        raw_networks = await client.get_networks()
        networks = extract_list(raw_networks, "networks")
        if networks:
            net_id = extract_id_from_url(networks[0].get("url"))
            if net_id:
                try:
                    return validate_identifier(net_id)
                except EeroValidationException:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid network_id.",
                    )
    except EeroAuthenticationException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No network available. Please specify network_id.",
    )


async def clear_client_session() -> None:
    """Clear the stored credential for the shared EeroClient, if any.

    Used by the global exception handler for ``EeroAuthenticationException``
    and by ``/auth/status`` on an expired-session probe, so a dead token
    never lingers on disk once we know it is dead (phase-6.0-revamp.md § 4.1).
    """
    if _client is not None:
        await _client.clear_session_token()


async def shutdown_client() -> None:
    """Shutdown the EeroClient on application shutdown."""
    global _client
    if _client is not None:
        await _client.__aexit__(None, None, None)
        _client = None
        _LOGGER.info("EeroClient shutdown complete")
