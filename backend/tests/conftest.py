"""Shared test fixtures for backend tests.

This module provides reusable fixtures for testing FastAPI routes
with a mocked EeroClient dependency.

As of eero-api v2.0.0, all client methods return raw JSON responses
in the format {"meta": {...}, "data": {...}}.

As of phase-6.0-revamp.md § 8.1, the mock is built with
``create_autospec(EeroClient, instance=True)`` rather than a bare
``MagicMock()``: a renamed or removed SDK method now fails the test at
call time instead of silently returning a non-awaitable mock.
"""

import copy
from unittest.mock import AsyncMock, create_autospec

import pytest
from eero import EeroClient
from eero.exceptions import (
    EeroAccessDeniedException,
    EeroAPIException,
    EeroAuthenticationException,
    EeroClientBlockedException,
    EeroFeatureUnavailableException,
    EeroNetworkException,
    EeroNotFoundException,
    EeroPremiumRequiredException,
    EeroRateLimitException,
    EeroTimeoutException,
    EeroValidationException,
)
from httpx import ASGITransport, AsyncClient

from app.deps import get_eero_client
from app.main import app


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


@pytest.fixture(scope="session")
def _eero_client_autospec_template() -> EeroClient:
    """The expensive part of ``create_autospec(EeroClient, instance=True)``,
    built exactly once per test run.

    ``create_autospec`` eagerly walks every method on ``EeroClient`` and
    derives a signature-checked child mock for each one; profiling the
    suite (backend test-performance investigation, 2026-09-24) showed this
    costs ~0.3-0.4s *per call*, and it was being called once per test via
    the function-scoped ``mock_eero_client`` fixture -- roughly 250 async
    tests' worth, i.e. most of the suite's runtime. ``copy.deepcopy()`` of
    an already-built template is ~2.5x cheaper and produces a fully
    independent ``NonCallableMagicMock`` (verified: mutating the clone's
    attributes, reassigning methods to new ``AsyncMock``s, and the
    signature-checking/AttributeError-on-unknown-method behaviour are all
    unaffected by, and do not affect, the template or other clones).
    """
    return create_autospec(EeroClient, instance=True)


@pytest.fixture
def mock_eero_client(_eero_client_autospec_template):
    """Create an autospec'd mock EeroClient for unit tests.

    Mock at the external boundary - the eero-api SDK.
    This is the right place to mock since eero-api
    is our external dependency.

    As of v2.0.0, all methods return raw JSON responses.
    """
    client = copy.deepcopy(_eero_client_autospec_template)
    client.is_authenticated = False
    client.preferred_network_id = None

    # Async methods - all return raw responses
    # Real API format: {"meta": {...}, "data": [...]} where data is directly a list
    client.login = AsyncMock(return_value=make_raw_response({}))
    client.verify = AsyncMock(return_value=make_raw_response({}))
    client.logout = AsyncMock(return_value=make_raw_response({}))
    client.clear_session_token = AsyncMock(return_value=None)
    client.get_account = AsyncMock(return_value=make_raw_response({}))
    # Networks endpoint returns list directly in data
    client.get_networks = AsyncMock(return_value=make_raw_response([]))
    # Devices endpoint returns list directly in data
    client.get_devices = AsyncMock(return_value=make_raw_response([]))
    # Eeros endpoint returns list directly in data
    client.get_eeros = AsyncMock(return_value=make_raw_response([]))
    # Profiles endpoint returns list directly in data
    client.get_profiles = AsyncMock(return_value=make_raw_response([]))

    return client


@pytest.fixture
def authenticated_client(mock_eero_client):
    """Mock client in authenticated state."""
    mock_eero_client.is_authenticated = True
    mock_eero_client.preferred_network_id = "network-123"
    return mock_eero_client


@pytest.fixture
async def async_client(mock_eero_client):
    """Async HTTP test client with mocked EeroClient.

    Uses httpx.AsyncClient for testing async FastAPI endpoints.
    """

    async def override_get_eero_client():
        yield mock_eero_client

    app.dependency_overrides[get_eero_client] = override_get_eero_client

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(authenticated_client):
    """Async test client with authenticated EeroClient."""

    async def override_get_eero_client():
        yield authenticated_client

    app.dependency_overrides[get_eero_client] = override_get_eero_client

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Exception fixtures (phase-6.0-revamp.md § 8.1): one factory per v8
# exception class, each carrying error_code/envelope so
# test_exception_mapping.py can assert on them.
# ---------------------------------------------------------------------------


@pytest.fixture
def experimental_writes_enabled(monkeypatch):
    """Enable ``EERO_DASHBOARD_EXPERIMENTAL_WRITES`` for one test.

    ``require_experimental_writes`` (``app/deps.py``) reads the shared
    ``app.config.settings`` singleton, so tests exercising a WP7-gated
    write monkeypatch that attribute directly rather than re-parsing the
    environment.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "experimental_writes", True)
    yield


@pytest.fixture
def eero_exceptions():
    """Factory functions building one instance of each v8 exception class.

    Each carries a representative ``error_code`` and ``envelope`` so
    handler tests can assert those are logged/used but never leaked to
    the client in ``detail``.
    """
    envelope = {"meta": {"code": 400, "error": "test_error"}}

    return {
        "authentication": lambda: EeroAuthenticationException(
            "session dead", envelope=envelope, error_code="auth_error"
        ),
        "not_found": lambda: EeroNotFoundException(
            "device", "abc123", envelope=envelope, error_code="not_found"
        ),
        "access_denied": lambda: EeroAccessDeniedException(
            403, "forbidden", envelope=envelope, error_code="access_denied"
        ),
        "premium_required": lambda: EeroPremiumRequiredException(
            "Guest network",
            status_code=402,
            envelope=envelope,
            error_code="premium_required",
        ),
        "feature_unavailable": lambda: EeroFeatureUnavailableException(
            "Thread",
            "not supported on this hardware",
            status_code=409,
            envelope=envelope,
            error_code="feature_unavailable",
        ),
        "client_blocked": lambda: EeroClientBlockedException(
            426, "upgrade required", envelope=envelope, error_code="client_blocked"
        ),
        "rate_limit": lambda: EeroRateLimitException(
            "slow down", envelope=envelope, error_code="rate_limited"
        ),
        "validation": lambda: EeroValidationException(
            "name", "cannot be empty", envelope=envelope, error_code="validation"
        ),
        "network": lambda: EeroNetworkException(
            "connection reset", envelope=envelope, error_code="network_error"
        ),
        "timeout": lambda: EeroTimeoutException(
            "timed out", envelope=envelope, error_code="timeout"
        ),
        "api": lambda: EeroAPIException(
            500, "internal error", envelope=envelope, error_code="api_error"
        ),
    }
