"""Authentication routes for the Eero Dashboard."""

import logging
from pathlib import Path

from eero import EeroClient
from eero.exceptions import EeroAuthenticationException, EeroNetworkException
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings
from ..deps import get_eero_client

router = APIRouter()
_LOGGER = logging.getLogger(__name__)

# Shared session path for eero-prometheus-exporter
EXPORTER_SESSION_PATH = Path(settings.exporter_session_path)

# Rate limiter for auth endpoints (prevents brute force attacks)
limiter = Limiter(key_func=get_remote_address)


class LoginRequest(BaseModel):
    """Request body for login endpoint."""

    identifier: str  # Email or phone number


class VerifyRequest(BaseModel):
    """Request body for verify endpoint."""

    code: str  # Verification code


class AuthStatusResponse(BaseModel):
    """Response for auth status endpoint."""

    authenticated: bool
    preferred_network_id: str | None = None
    user_email: str | None = None
    user_name: str | None = None
    user_phone: str | None = None
    user_role: str | None = None
    account_id: str | None = None
    premium_status: str | None = None


class LoginResponse(BaseModel):
    """Response for login endpoint."""

    success: bool
    message: str


class VerifyResponse(BaseModel):
    """Response for verify endpoint."""

    success: bool
    message: str
    preferred_network_id: str | None = None


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status(
    client: EeroClient = Depends(get_eero_client),
) -> AuthStatusResponse:
    """Check current authentication status."""
    user_email = None
    user_name = None
    user_phone = None
    user_role = None
    account_id = None
    premium_status = None

    if client.is_authenticated:
        try:
            account = await client.get_account()
            account_id = account.id
            premium_status = account.premium_status

            if account.users:
                # Get the first user (typically the owner)
                user = account.users[0]
                user_email = user.email
                user_name = user.name
                user_phone = user.phone
                user_role = user.role

            # Log minimal info - avoid PII in logs
            _LOGGER.debug(f"Auth status check: authenticated, account_id={account_id}")
        except Exception as e:
            _LOGGER.warning(f"Failed to get account info: {e}")

    return AuthStatusResponse(
        authenticated=client.is_authenticated,
        preferred_network_id=client.preferred_network_id,
        user_email=user_email,
        user_name=user_name,
        user_phone=user_phone,
        user_role=user_role,
        account_id=account_id,
        premium_status=premium_status,
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_request: LoginRequest,
    client: EeroClient = Depends(get_eero_client),
) -> LoginResponse:
    """Start the login process.

    Sends a verification code to the provided email or phone number.
    Rate limited to 5 attempts per minute per IP address.
    """
    try:
        success = await client.login(login_request.identifier)
        if success:
            return LoginResponse(
                success=True,
                message="Verification code sent. Check your email or phone.",
            )
        return LoginResponse(
            success=False,
            message="Failed to initiate login. Please try again.",
        )
    except EeroAuthenticationException as e:
        _LOGGER.warning(f"Login failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please check your credentials.",
        )
    except EeroNetworkException as e:
        _LOGGER.error(f"Network error during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Network error. Please check your connection.",
        )


async def _sync_session_to_exporter() -> None:
    """Copy the authenticated session to the shared location.

    This allows eero-prometheus-exporter to use the same session
    for metrics collection. Reads from the main session file and
    copies to the exporter session path.
    """
    try:
        # Read the session from the main cookie file
        main_session_path = Path(settings.cookie_file)
        if not main_session_path.exists():
            _LOGGER.warning("Main session file not found, cannot sync to exporter")
            return

        session_content = main_session_path.read_text()

        # Ensure exporter directory exists
        EXPORTER_SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Copy session to exporter location
        EXPORTER_SESSION_PATH.write_text(session_content)

        _LOGGER.info("Session synced to eero-prometheus-exporter")
    except Exception as e:
        _LOGGER.warning(f"Failed to sync session to exporter: {e}")


async def _clear_exporter_session() -> None:
    """Remove the exporter session file on logout."""
    try:
        if EXPORTER_SESSION_PATH.exists():
            EXPORTER_SESSION_PATH.unlink()
            _LOGGER.info("Exporter session cleared")
    except Exception as e:
        _LOGGER.warning(f"Failed to clear exporter session: {e}")


@router.post("/verify", response_model=VerifyResponse)
@limiter.limit("5/minute")
async def verify(
    request: Request,
    verify_request: VerifyRequest,
    client: EeroClient = Depends(get_eero_client),
) -> VerifyResponse:
    """Verify the login with the code sent to the user.

    Rate limited to 5 attempts per minute per IP address.
    """
    try:
        success = await client.verify(verify_request.code)
        if success:
            # Sync session to eero-prometheus-exporter
            await _sync_session_to_exporter()

            return VerifyResponse(
                success=True,
                message="Login successful!",
                preferred_network_id=client.preferred_network_id,
            )
        return VerifyResponse(
            success=False,
            message="Verification failed. Please try again.",
        )
    except EeroAuthenticationException as e:
        _LOGGER.warning(f"Verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid verification code. Please try again.",
        )
    except EeroNetworkException as e:
        _LOGGER.error(f"Network error during verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Network error. Please check your connection.",
        )


@router.post("/logout")
async def logout(
    client: EeroClient = Depends(get_eero_client),
) -> dict:
    """Log out from the Eero API."""
    try:
        # Clear exporter session first
        await _clear_exporter_session()

        success = await client.logout()
        return {"success": success, "message": "Logged out successfully."}
    except Exception as e:
        _LOGGER.error(f"Logout error: {e}")
        # Even if logout fails, clear local state and exporter session
        await _clear_exporter_session()
        return {"success": True, "message": "Logged out locally."}
