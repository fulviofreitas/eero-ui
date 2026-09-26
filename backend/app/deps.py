"""FastAPI dependencies for the Eero Dashboard."""

import asyncio
import json
import logging
import os
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path

from eero import EeroClient
from eero.api.links import validate_identifier
from eero.exceptions import EeroAuthenticationException, EeroValidationException
from fastapi import Depends, HTTPException, status

from .config import settings
from .transformers import (
    InvalidIdentifierError,
    extract_id_from_url,
    extract_list,
    validate_path_id,
)

_LOGGER = logging.getLogger(__name__)

# Global client instance (single account mode)
_client: EeroClient | None = None

# Guards the first construction of the singleton so two concurrent first
# requests can never build two EeroClient instances (phase-6.0-revamp.md
# § 3.1).
_client_lock = asyncio.Lock()

# Persisted preferred-network preference (eero-ui#401): ``EeroClient``'s own
# ``set_preferred_network`` is in-memory only (eero-api client.py), so a
# container restart otherwise loses the user's selection and
# ``get_network_id`` silently falls back to the account's first network.
# Stored next to the session cookie file, as a single-key JSON document.
_PREFERRED_NETWORK_FILENAME = "preferred-network.json"


def _preferred_network_file() -> Path:
    """Path to the persisted preferred-network file.

    Lives alongside ``settings.cookie_file`` rather than in a fixed
    location, so it moves with ``EERO_DASHBOARD_COOKIE_FILE`` and never
    needs its own environment variable.
    """
    return Path(settings.cookie_file).parent / _PREFERRED_NETWORK_FILENAME


def _load_preferred_network_id() -> str | None:
    """Best-effort load of the persisted preferred network id.

    Returns ``None`` for anything short of a valid, well-formed id: a
    missing file, unreadable file, corrupt JSON, wrong shape, or an id that
    fails ``validate_path_id``. This restores a UI convenience, never a
    hard dependency - ``get_network_id`` already has its own fallback to
    the account's first network, so a failure here is silently ignored
    (logged at DEBUG only; network ids are not secrets, but there is no
    reason to log them at a level that shows up by default).
    """
    path = _preferred_network_file()
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError):
        _LOGGER.debug("Ignoring unreadable preferred-network file at %s", path)
        return None

    try:
        data = json.loads(raw)
        network_id = data["network_id"]
    except (json.JSONDecodeError, KeyError, TypeError):
        _LOGGER.debug("Ignoring corrupt preferred-network file at %s", path)
        return None

    if not isinstance(network_id, str) or not network_id:
        _LOGGER.debug("Ignoring malformed preferred-network id in %s", path)
        return None

    try:
        return validate_path_id(network_id)
    except InvalidIdentifierError:
        _LOGGER.debug("Ignoring invalid persisted preferred-network id")
        return None


def save_preferred_network_id(network_id: str) -> None:
    """Persist ``network_id`` as the preferred network, atomically.

    Writes a temp file in the same directory (so the final ``os.replace``
    is an atomic rename on the same filesystem) with mode 0600 before it is
    ever visible at the final path, then renames it into place. Best
    effort: a failure here is logged and swallowed by the caller
    (``routes/networks.py``'s ``set_preferred_network``) rather than
    failing the request - the in-memory preference set via
    ``client.set_preferred_network()`` already took effect for the current
    process.
    """
    path = _preferred_network_file()
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(
        dir=path.parent, prefix=".preferred-network-", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(json.dumps({"network_id": network_id}))
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, path)
    except OSError:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def clear_preferred_network_id() -> None:
    """Remove the persisted preferred-network file, if present.

    Called on logout (``routes/auth.py``) so a stale preference never
    outlives the session it was recorded for.
    """
    try:
        _preferred_network_file().unlink()
    except FileNotFoundError:
        pass
    except OSError as exc:
        _LOGGER.debug("Failed to remove preferred-network file: %s", exc)


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

                preferred_network_id = _load_preferred_network_id()
                if preferred_network_id:
                    new_client.set_preferred_network(preferred_network_id)

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
    # is_authenticated is a property on EeroClient, not a method.
    # nosemgrep: python.lang.maintainability.is-function-without-parentheses.is-function-without-parentheses
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


class AccountIdentityWriteDisabledError(Exception):
    """Raised by ``require_account_identity_writes`` when its gate is closed.

    Distinct from ``ExperimentalWriteDisabledError`` so ``main.py`` can map
    it to a different ``type`` (``account_identity_disabled``) in the JSON
    body, and so a route can require *both* gates independently.
    """


async def require_account_identity_writes() -> None:
    """Second, independent dependency gating account-identity writes
    (SECURITY-SME finding, 2026-09-24): ``PUT /account/email``,
    ``PUT /account/phone`` and their ``/verify`` counterparts change the
    credential eero uses to identify and recover the account, so
    ``EERO_DASHBOARD_EXPERIMENTAL_WRITES`` alone is not a strong enough
    gate - an operator who enables it for an unrelated settings screen
    would otherwise also silently expose account-takeover-adjacent writes.
    Routes protected by this depend on it *in addition to*
    ``require_experimental_writes``, not instead of it.

    Raises ``AccountIdentityWriteDisabledError`` (mapped to 403 by the
    handler in ``main.py``) unless
    ``EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES`` is set.
    """
    if not settings.account_identity_writes:
        raise AccountIdentityWriteDisabledError()


async def validate_request_path_ids(
    network_id: str | None = None,
    eero_id: str | None = None,
    profile_id: str | None = None,
    device_id: str | None = None,
) -> None:
    """Router-level retrofit of ``transformers.validate_path_id`` (WP7
    follow-up (a), coordinator directive 2026-09-24) onto every route with
    a ``{network_id}``, ``{eero_id}``, ``{profile_id}`` or ``{device_id}``
    path parameter.

    Added to each of ``networks.py``/``devices.py``/``eeros.py``/
    ``profiles.py``'s ``APIRouter(dependencies=[...])`` rather than to
    every individual route: FastAPI resolves a router-level dependency's
    own parameters from the request's actual path template, so a route
    that has none of these four path parameters simply leaves them at
    their ``None`` default here and this is a no-op for it - it is safe to
    apply blanket rather than auditing each route's exact parameter set by
    hand, and it can never mask a *body* or *query* parameter of the same
    name (path parameters take precedence in FastAPI's own resolution, so
    this dependency and the path operation function always see the same
    value for a given name).

    Raises:
        HTTPException: 400 (static detail, never echoing the offending
            value) if any of the four ids that IS present on this route
            fails ``validate_path_id`` - rejects a value containing ``..``,
            a bare newline (``%0A``), an embedded ``/``, or anything else
            outside the SDK's own identifier grammar.
    """
    for name, value in (
        ("network_id", network_id),
        ("eero_id", eero_id),
        ("profile_id", profile_id),
        ("device_id", device_id),
    ):
        if value is None:
            continue
        try:
            validate_path_id(value)
        except InvalidIdentifierError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid {name}.",
            ) from exc


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
                except EeroValidationException as exc:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid network_id.",
                    ) from exc
    except EeroAuthenticationException as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        ) from exc

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
