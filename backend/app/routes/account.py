"""Account profile routes for the Eero Dashboard.

phase-6.0-revamp.md WP7, family 9: account profile writes. Unverified,
non-settings writes (§ 5); none allowlisted (sdk-surface-map-v8.0.3.md
WP7). eero.api.account never logs the value of a name/email/phone/code
argument, and neither does this module.
"""

import logging
import re

from eero import EeroClient
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ..deps import (
    require_account_identity_writes,
    require_auth,
    require_experimental_writes,
)
from ..transformers import check_success, extract_data, has_control_or_format_chars
from .auth import limiter

router = APIRouter()
_LOGGER = logging.getLogger(__name__)

_NAME_MAX_LEN = 64
_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
# Loose E.164-ish check: optional leading '+', 7-15 digits. The SDK forwards
# the value unchanged, so this is a shape guard, not a carrier-validity check.
_PHONE_RE = re.compile(r"\+?\d{7,15}")
_VERIFICATION_CODE_RE = re.compile(r"\d{4,8}")


def _validate_name(name: str) -> str:
    stripped = name.strip()
    if not stripped or len(stripped) > _NAME_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"name must be 1-{_NAME_MAX_LEN} characters.",
        )
    if has_control_or_format_chars(stripped):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="name is invalid."
        )
    return stripped


def _validate_email(email: str) -> str:
    if not _EMAIL_RE.fullmatch(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="email is not a valid address.",
        )
    return email


def _validate_phone(phone: str) -> str:
    if not _PHONE_RE.fullmatch(phone):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="phone must be 7-15 digits, optionally prefixed with '+'.",
        )
    return phone


def _validate_verification_code(code: str) -> str:
    if not _VERIFICATION_CODE_RE.fullmatch(code):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="code must be 4-8 digits.",
        )
    return code


class AccountActionResponse(BaseModel):
    """Generic response for an account-profile write. Never echoes the
    submitted value (name/email/phone/code) - only whether the call
    succeeded."""

    success: bool


class AccountNameRequest(BaseModel):
    """Request body for PUT /account/name."""

    name: str

    class Config:
        extra = "ignore"


@router.put(
    "/name",
    response_model=AccountActionResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="account_writes")
async def set_account_name_route(
    request: Request,
    body: AccountNameRequest,
    client: EeroClient = Depends(require_auth),
) -> AccountActionResponse:
    """Set the account's display name.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). Never retried on
    failure.
    """
    name = _validate_name(body.name)
    raw_result = await client.set_account_name(name)
    return AccountActionResponse(success=check_success(raw_result))


class AccountEmailRequest(BaseModel):
    """Request body for PUT /account/email."""

    email: str

    class Config:
        extra = "ignore"


@router.put(
    "/email",
    response_model=AccountActionResponse,
    dependencies=[
        Depends(require_experimental_writes),
        Depends(require_account_identity_writes),
    ],
)
@limiter.shared_limit("10/minute", scope="account_writes")
async def set_account_email_route(
    request: Request,
    body: AccountEmailRequest,
    client: EeroClient = Depends(require_auth),
) -> AccountActionResponse:
    """Start an account e-mail change - inactive until confirmed via
    ``POST /account/email/verify``.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). The submitted
    address is never logged or echoed back. Never retried on failure.
    """
    email = _validate_email(body.email)
    raw_result = await client.set_account_email(email)
    return AccountActionResponse(success=check_success(raw_result))


class VerificationCodeRequest(BaseModel):
    """Request body for the email/phone verification endpoints."""

    code: str

    class Config:
        extra = "ignore"


@router.post(
    "/email/verify",
    response_model=AccountActionResponse,
    dependencies=[
        Depends(require_experimental_writes),
        Depends(require_account_identity_writes),
    ],
)
@limiter.shared_limit("10/minute", scope="account_writes")
async def verify_account_email_route(
    request: Request,
    body: VerificationCodeRequest,
    client: EeroClient = Depends(require_auth),
) -> AccountActionResponse:
    """Confirm a pending e-mail change with its verification code.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). The code is never
    logged or echoed back. Never retried on failure.
    """
    code = _validate_verification_code(body.code)
    raw_result = await client.verify_account_email(code)
    return AccountActionResponse(success=check_success(raw_result))


class AccountPhoneRequest(BaseModel):
    """Request body for PUT /account/phone."""

    phone: str

    class Config:
        extra = "ignore"


@router.put(
    "/phone",
    response_model=AccountActionResponse,
    dependencies=[
        Depends(require_experimental_writes),
        Depends(require_account_identity_writes),
    ],
)
@limiter.shared_limit("10/minute", scope="account_writes")
async def set_account_phone_route(
    request: Request,
    body: AccountPhoneRequest,
    client: EeroClient = Depends(require_auth),
) -> AccountActionResponse:
    """Start an account phone-number change - inactive until confirmed via
    ``POST /account/phone/verify``.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). The submitted
    number is never logged or echoed back. Never retried on failure.
    """
    phone = _validate_phone(body.phone)
    raw_result = await client.set_account_phone(phone)
    return AccountActionResponse(success=check_success(raw_result))


@router.post(
    "/phone/verify",
    response_model=AccountActionResponse,
    dependencies=[
        Depends(require_experimental_writes),
        Depends(require_account_identity_writes),
    ],
)
@limiter.shared_limit("10/minute", scope="account_writes")
async def verify_account_phone_route(
    request: Request,
    body: VerificationCodeRequest,
    client: EeroClient = Depends(require_auth),
) -> AccountActionResponse:
    """Confirm a pending phone-number change with its verification code.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). The code is never
    logged or echoed back. Never retried on failure.
    """
    code = _validate_verification_code(body.code)
    raw_result = await client.verify_account_phone(code)
    return AccountActionResponse(success=check_success(raw_result))


class AccountConsentsRequest(BaseModel):
    """Request body for PUT /account/consents."""

    marketing_emails: bool

    class Config:
        extra = "ignore"


@router.put(
    "/consents",
    response_model=AccountActionResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="account_writes")
async def set_account_consents_route(
    request: Request,
    body: AccountConsentsRequest,
    client: EeroClient = Depends(require_auth),
) -> AccountActionResponse:
    """Set the account's marketing-email consent.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7). Never retried on
    failure.
    """
    raw_result = await client.set_account_consents(
        marketing_emails=body.marketing_emails
    )
    return AccountActionResponse(success=check_success(raw_result))


class SmsCountriesResponse(BaseModel):
    """The SMS country-code catalogue."""

    countries: list[dict] = []


@router.get("/sms-countries", response_model=SmsCountriesResponse)
async def get_sms_countries_route(
    client: EeroClient = Depends(require_auth),
) -> SmsCountriesResponse:
    """Get the SMS country-code catalogue. Verified read."""
    raw = await client.get_sms_countries()
    data = extract_data(raw)
    countries = data.get("countries")
    return SmsCountriesResponse(
        countries=countries if isinstance(countries, list) else []
    )
