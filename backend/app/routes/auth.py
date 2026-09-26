"""Authentication routes for the Eero Dashboard."""

import logging

from eero import EeroClient
from eero.exceptions import EeroAuthenticationException, EeroNetworkException
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..deps import clear_client_session, clear_preferred_network_id, get_eero_client
from ..transformers import check_success, extract_data, extract_id_from_url

router = APIRouter()
_LOGGER = logging.getLogger(__name__)

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
    reason: str | None = None
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
    """Check current authentication status.

    ``is_authenticated`` means only "a token is on disk" as of eero-api v8
    (phase-6.0-revamp.md § 4.1) - it does not verify the token still works.
    This route keeps the ``get_account()`` probe to distinguish a live
    session from a dead one, and reports which case it saw via ``reason``:

    - ``"none"``: no token at all.
    - ``"expired"``: a token exists but the cloud rejected it; the token is
      cleared here so a later call to this route reports ``authenticated:
      false`` too, instead of looping.
    - ``None``: authenticated with a working session (or the probe failed
      for a reason other than authentication, e.g. a transient network
      error - today's "authenticated but no account info" behaviour).
    """
    user_email = None
    user_name = None
    user_phone = None
    user_role = None
    account_id = None
    premium_status = None
    # is_authenticated is a property on EeroClient, not a method.
    # nosemgrep: python.lang.maintainability.is-function-without-parentheses.is-function-without-parentheses
    authenticated = client.is_authenticated
    reason: str | None = None if authenticated else "none"

    if authenticated:
        try:
            raw_account = await client.get_account()
            account = extract_data(raw_account)

            # Extract account ID from URL
            account_id = extract_id_from_url(account.get("url"))
            premium_status = account.get("premium_status")

            # Get users list
            users = account.get("users", [])
            if users and isinstance(users, list) and len(users) > 0:
                # Get the first user (typically the owner)
                user = users[0]
                if isinstance(user, dict):
                    user_email = user.get("email")
                    user_name = user.get("name")
                    user_phone = user.get("phone")
                    user_role = user.get("role")

            # Log minimal info - avoid PII in logs
            _LOGGER.debug("Auth status check: authenticated, account_id=%s", account_id)
        except EeroAuthenticationException:
            _LOGGER.info("Auth status check: session expired, clearing stored token")
            await clear_client_session()
            authenticated = False
            reason = "expired"
        except Exception as e:
            _LOGGER.warning("Failed to get account info: %s", e)

    return AuthStatusResponse(
        authenticated=authenticated,
        reason=reason,
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
        raw_result = await client.login(login_request.identifier)
        success = check_success(raw_result)
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
        _LOGGER.warning("Login failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please check your credentials.",
        ) from e
    except EeroNetworkException as e:
        _LOGGER.error("Network error during login: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Network error. Please check your connection.",
        ) from e


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
        raw_result = await client.verify(verify_request.code)
        success = check_success(raw_result)
        if success:
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
        _LOGGER.warning("Verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid verification code. Please try again.",
        ) from e
    except EeroNetworkException as e:
        _LOGGER.error("Network error during verification: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Network error. Please check your connection.",
        ) from e


@router.post("/logout")
async def logout(
    client: EeroClient = Depends(get_eero_client),
) -> dict:
    """Log out from the Eero API."""
    clear_preferred_network_id()
    # The SDK keeps the in-memory preference across logout()/verify(); reset
    # it so a different account logging in next never inherits this one's id.
    client.set_preferred_network(None)  # type: ignore[arg-type]
    try:
        raw_result = await client.logout()
        success = check_success(raw_result)
        return {"success": success, "message": "Logged out successfully."}
    except Exception as e:
        _LOGGER.error("Logout error: %s", e)
        # Even if logout fails, clear local state
        return {"success": True, "message": "Logged out locally."}
