"""Authentication routes for the Eero Dashboard."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from eero import EeroClient
from eero.exceptions import EeroAuthenticationException, EeroNetworkException

from ..deps import get_eero_client

router = APIRouter()
_LOGGER = logging.getLogger(__name__)


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
                
            _LOGGER.info(f"Auth status: account_id={account_id}, user_email={user_email}, user_name={user_name}, premium={premium_status}")
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
async def login(
    request: LoginRequest,
    client: EeroClient = Depends(get_eero_client),
) -> LoginResponse:
    """Start the login process.

    Sends a verification code to the provided email or phone number.
    """
    try:
        success = await client.login(request.identifier)
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
            detail=str(e),
        )
    except EeroNetworkException as e:
        _LOGGER.error(f"Network error during login: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Network error. Please check your connection.",
        )


@router.post("/verify", response_model=VerifyResponse)
async def verify(
    request: VerifyRequest,
    client: EeroClient = Depends(get_eero_client),
) -> VerifyResponse:
    """Verify the login with the code sent to the user."""
    try:
        success = await client.verify(request.code)
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
        success = await client.logout()
        return {"success": success, "message": "Logged out successfully."}
    except Exception as e:
        _LOGGER.error(f"Logout error: {e}")
        # Even if logout fails, clear local state
        return {"success": True, "message": "Logged out locally."}
