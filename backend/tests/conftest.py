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
from app.routes.auth import limiter


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset slowapi's in-memory limiter storage before every test.

    WP7/WP8 (phase-6.0-revamp.md § 7) put dozens of routes across
    networks.py/devices.py/eeros.py/profiles.py behind a handful of shared
    scopes (``experimental_writes`` at 10/minute, plus ``speedtest``,
    ``guest_password``, ``device_type``, ``led_brightness``). slowapi's
    default storage is a single process-wide in-memory counter keyed by
    remote address + scope, so without a reset a test late in the suite
    that calls, say, an ``experimental_writes``-gated route inherits the
    call count left behind by every earlier test that hit the same scope
    from the same test-client IP, and starts failing with 429 instead of
    the status the test actually asserts on. Reset happens before, not
    after, so a test can still assert on rate-limit behavior itself
    (e.g. a 429 on the Nth call within one test).
    """
    limiter.reset()


@pytest.fixture(autouse=True)
def _reset_networks_module_state():
    """Reset the other two module-level, process-global dicts on
    ``app.routes.networks`` before and after every test.

    ``_last_speed_test_started`` (the per-network speed-test in-flight
    guard) and ``_last_update_applied`` (the per-network firmware-update
    cooldown) have no dependency-injection seam, exactly like ``limiter``
    above, so a write in one test's speedtest/update-apply route call
    persists and can leak into any later test keyed on the same
    network_id. Before this fixture, the reset was duplicated ad hoc in
    three different files (``test_networks.py``'s
    ``TestRunSpeedTest``, ``test_write_validation.py``,
    ``test_wp8_updates_apply.py``) with a real gap:
    ``test_security_hardening.py``'s
    ``TestSpeedTestGuardClearedOnFailure::test_failed_kickoff_does_not_block_a_retry``
    calls the speedtest route to a 202 success and never cleared the
    guard afterwards (TEST-SME audit, 2026-09-24). It happened not to
    break anything only because no later test file reused network_id
    "net-1" for a speed test within the same run -- exactly the kind of
    ordering-dependent fragility an autouse, session-wide reset removes
    for good.
    """
    from app.routes.networks import _last_speed_test_started, _last_update_applied

    _last_speed_test_started.clear()
    _last_update_applied.clear()
    yield
    _last_speed_test_started.clear()
    _last_update_applied.clear()


@pytest.fixture(scope="session")
def _eero_client_autospec_template() -> EeroClient:
    """The expensive part of ``create_autospec(EeroClient, instance=True)``,
    built exactly once per test run.

    ``create_autospec`` eagerly walks every method on ``EeroClient`` and
    derives a signature-checked child mock for each one; profiling the
    suite (backend test-performance investigation, 2026-09-24) showed this
    costs ~0.3-0.4s *per call*. It is built once, session-scoped, and every
    test clones from it lazily -- see ``_LazyEeroClientClone`` below.
    """
    return create_autospec(EeroClient, instance=True)


def _cheap_clone_mock_child(child):
    """Deep-copy a single autospec'd child mock (one method/attribute)
    without dragging the rest of the ~200-member tree along with it.

    ``create_autospec`` builds every method as a child mock that keeps a
    back-reference to its parent (``_mock_parent``/``_mock_new_parent``)
    so call records can bubble up to the top-level mock's ``mock_calls``.
    That back-reference is exactly why ``copy.deepcopy()`` of a *single*
    child mock is just as slow as deepcopy of the whole template (both
    measured at ~0.13s in the backend test-performance investigation,
    2026-09-24): deepcopy follows the reference and walks everything else
    reachable from the parent anyway. Nothing in this suite asserts on a
    top-level ``mock_calls`` aggregate (grepped, none found), so the
    back-reference is severed on the *template's* child for the duration
    of the copy and restored immediately after. The resulting clone is
    fully independent, keeps its per-method signature checking, and is
    ~180x cheaper to produce than the same copy with the parent link
    intact.
    """
    parent = getattr(child, "_mock_parent", None)
    new_parent = getattr(child, "_mock_new_parent", None)
    child._mock_parent = None
    child._mock_new_parent = None
    try:
        return copy.deepcopy(child)
    finally:
        child._mock_parent = parent
        child._mock_new_parent = new_parent


class _LazyEeroClientClone:
    """A per-test clone of the session-scoped autospec template that only
    pays the deepcopy cost for attributes a given test actually touches.

    Eagerly deep-copying the full autospec tree costs ~0.13s regardless of
    how many of its ~200 methods a test exercises, and essentially every
    test in the suite paid that cost once via ``mock_eero_client`` --
    together the dominant share of the ~95s full-suite runtime (profiled
    2026-09-24). Most tests touch a handful of methods. This wrapper
    defers cloning to first access (via ``_cheap_clone_mock_child``),
    caches the result, and is otherwise indistinguishable from the eager
    deepcopy it replaces: unknown attributes still raise ``AttributeError``
    (autospec is preserved, see ``test_fixtures.py``), each cloned method
    keeps its own signature checking, and clones are fully independent of
    the template and of each other. Assigning a plain attribute (e.g.
    ``client.get_eeros = AsyncMock(...)``) simply overrides the cache
    entry, exactly as it would on a real deepcopy.
    """

    def __init__(self, template) -> None:
        object.__setattr__(self, "_template", template)
        object.__setattr__(self, "_overrides", {})

    def __getattr__(self, name):
        overrides = object.__getattribute__(self, "_overrides")
        if name in overrides:
            return overrides[name]
        template = object.__getattribute__(self, "_template")
        attr = getattr(template, name)  # AttributeError propagates as-is
        clone = _cheap_clone_mock_child(attr)
        overrides[name] = clone
        return clone

    def __setattr__(self, name, value) -> None:
        object.__getattribute__(self, "_overrides")[name] = value


@pytest.fixture
def _clone_eero_client(_eero_client_autospec_template):
    """Factory fixture: produce a fresh ``_LazyEeroClientClone`` of the
    session-scoped autospec template.

    Exposed (rather than kept private to ``mock_eero_client``) so other
    test modules that need a differently-shaped default client -- e.g.
    ``test_collector.py``'s ``autospec_client``, which is authenticated by
    default and pre-wires a handful of collector-specific methods -- reuse
    the same cheap lazy-clone strategy instead of eagerly deepcopy-ing the
    whole template themselves.
    """

    def _make() -> _LazyEeroClientClone:
        return _LazyEeroClientClone(_eero_client_autospec_template)

    return _make


@pytest.fixture
def mock_eero_client(_eero_client_autospec_template):
    """Create an autospec'd mock EeroClient for unit tests.

    Mock at the external boundary - the eero-api SDK.
    This is the right place to mock since eero-api
    is our external dependency.

    As of v2.0.0, all methods return raw JSON responses.
    """
    client = _LazyEeroClientClone(_eero_client_autospec_template)
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


# Sent by every test client by default (main.py's CSRF guard middleware,
# SECURITY-SME finding, 2026-09-24) so existing and new write tests keep
# exercising the route logic they were written for rather than tripping
# over the CSRF guard. ``test_csrf.py`` builds its own client without this
# header to exercise the guard itself.
_CSRF_HEADERS = {"X-Requested-With": "eero-ui"}


@pytest.fixture
async def async_client(mock_eero_client):
    """Async HTTP test client with mocked EeroClient.

    Uses httpx.AsyncClient for testing async FastAPI endpoints.
    """

    async def override_get_eero_client():
        yield mock_eero_client

    app.dependency_overrides[get_eero_client] = override_get_eero_client

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=_CSRF_HEADERS
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(authenticated_client):
    """Async test client with authenticated EeroClient."""

    async def override_get_eero_client():
        yield authenticated_client

    app.dependency_overrides[get_eero_client] = override_get_eero_client

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=_CSRF_HEADERS
    ) as client:
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


@pytest.fixture
def account_identity_writes_enabled(monkeypatch):
    """Enable ``EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES`` for one test.

    Separate from, and additional to, ``experimental_writes_enabled``
    (SECURITY-SME finding, 2026-09-24): account-identity routes require
    both gates open.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "account_identity_writes", True)
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
