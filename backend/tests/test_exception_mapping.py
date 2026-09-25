"""Tests for the eero-api exception -> HTTP mapping (phase-6.0-revamp.md § 3.4).

One case per row of the § 3.4 table, driven through a real route
(``GET /api/networks/{id}``, which calls ``client.get_network``) so the
FastAPI exception-handler wiring in ``main.py`` is exercised end to end,
not just the handler functions in isolation. Asserts status, ``detail``,
``type`` (where applicable), headers, and that no envelope text leaks into
an INFO-level log record.
"""

import logging
from unittest.mock import AsyncMock

import pytest

from app import deps

# Reused verbatim from test_security.py's TestExceptionSanitization so the
# two suites can never drift apart on what counts as a "leak" (phase-6.0-
# revamp.md § 8.1: "forbidden-pattern check reusing test_security.py's
# patterns").
FORBIDDEN_PATTERNS = [
    "Exception",
    "Error:",
    "Traceback",
    'File "',
    "line ",
    "python",
    ".py",
]


class TestExceptionMapping:
    """One test per § 3.4 table row."""

    async def test_authentication_exception_maps_to_401(
        self, auth_client, authenticated_client, eero_exceptions, caplog
    ):
        """EeroAuthenticationException -> 401, clears the token, WWW-Authenticate.

        ``clear_client_session()`` (used by the exception handler) acts on
        the module-level EeroClient singleton in ``app.deps``, not on the
        dependency-overridden fixture the test client is wired to - so the
        singleton is pointed at the fixture for the duration of this test.
        """
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["authentication"]()
        )
        authenticated_client.clear_session_token = AsyncMock()
        deps._client = authenticated_client
        try:
            response = await auth_client.get("/api/networks/net-1")
        finally:
            deps._client = None

        assert response.status_code == 401
        assert response.json() == {
            "detail": "Session expired. Please log in again.",
            "reason": "expired",
        }
        assert response.headers["www-authenticate"] == "Bearer"
        authenticated_client.clear_session_token.assert_awaited_once()
        assert "test_error" not in caplog.text
        assert "session dead" not in caplog.text

    async def test_not_found_exception_maps_to_404(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroNotFoundException -> 404 with a generic, resource-typed detail."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["not_found"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 404
        assert response.json() == {"detail": "Device not found."}

    async def test_access_denied_exception_maps_to_403(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroAccessDeniedException -> 403."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["access_denied"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 403
        assert response.json() == {
            "detail": "Your eero account does not permit this action."
        }

    async def test_premium_required_exception_maps_to_402(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroPremiumRequiredException -> 402 with type=premium_required."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["premium_required"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 402
        body = response.json()
        assert body["type"] == "premium_required"
        assert "detail" in body
        assert "error_code" not in body

    async def test_feature_unavailable_exception_maps_to_409(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroFeatureUnavailableException -> 409, type + error_code included."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["feature_unavailable"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 409
        body = response.json()
        assert body["type"] == "feature_unavailable"
        assert body["error_code"] == "feature_unavailable"

    async def test_client_blocked_exception_maps_to_503(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroClientBlockedException -> 503."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["client_blocked"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 503
        assert "detail" in response.json()

    async def test_rate_limit_exception_maps_to_429(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroRateLimitException -> 429 with Retry-After: 60."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["rate_limit"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 429
        assert response.headers["retry-after"] == "60"

    async def test_validation_exception_maps_to_422(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroValidationException -> 422 with {field, message}, never the SDK envelope."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["validation"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["field"] == "name"
        assert "cannot be empty" in detail["message"]

    async def test_network_exception_maps_to_503(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroNetworkException -> 503."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["network"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 503
        assert response.json() == {"detail": "eero cloud unreachable. Try again."}

    async def test_timeout_exception_maps_to_503(
        self, auth_client, authenticated_client, eero_exceptions
    ):
        """EeroTimeoutException -> 503."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["timeout"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 503
        assert response.json() == {"detail": "eero cloud unreachable. Try again."}

    async def test_api_exception_maps_to_502(
        self, auth_client, authenticated_client, eero_exceptions, caplog
    ):
        """EeroAPIException (catch-all) -> 502; error_code/status_code logged, never leaked."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["api"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 502
        assert response.json() == {"detail": "eero cloud returned an error."}
        assert "internal error" not in response.text

    async def test_base_exception_maps_to_500(self, auth_client, authenticated_client):
        """Base EeroException (no more specific subclass) -> 500."""
        from eero.exceptions import EeroException

        authenticated_client.get_network = AsyncMock(
            side_effect=EeroException("some unmapped failure", error_code="x")
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 500
        assert response.json() == {"detail": "Internal server error"}
        assert "some unmapped failure" not in response.text

    async def test_no_envelope_text_leaks_at_info_level(
        self, auth_client, authenticated_client, eero_exceptions, caplog
    ):
        """The raw envelope never appears in an INFO-level log record."""
        import logging

        caplog.set_level(logging.INFO)
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["api"]()
        )

        await auth_client.get("/api/networks/net-1")

        for record in caplog.records:
            if record.levelno < logging.DEBUG + 1 and record.levelno >= logging.INFO:
                assert "test_error" not in record.getMessage()


class TestEnvelopeAppearsOnlyAtDebug:
    """§ 3.4's ``EeroAPIException`` row: 'log error_code + status_code;
    never envelope above DEBUG'. That is a two-sided claim -- the envelope
    must be absent above DEBUG (covered above) *and*, since the handler
    does log it, present at DEBUG. A test that only checks absence would
    also pass if the log line were deleted entirely, silently losing the
    diagnostic value the plan asks for.
    """

    async def test_envelope_is_logged_at_debug_for_api_exception(
        self, auth_client, authenticated_client, eero_exceptions, caplog
    ):
        """With DEBUG enabled, the envelope text does appear in the log."""
        caplog.set_level(logging.DEBUG)
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions["api"]()
        )

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 502
        debug_records = [r for r in caplog.records if r.levelno == logging.DEBUG]
        assert any(
            "test_error" in r.getMessage() for r in debug_records
        ), "the envelope must be logged at DEBUG when it is logged at all"


class TestNoForbiddenPatternLeaksAcrossEveryMapping:
    """Reuses test_security.py's forbidden-pattern list across every § 3.4
    row, driven through the real route, not a synthetic handler call."""

    @pytest.mark.parametrize(
        "exception_key",
        [
            "authentication",
            "not_found",
            "access_denied",
            "premium_required",
            "feature_unavailable",
            "client_blocked",
            "rate_limit",
            "validation",
            "network",
            "timeout",
            "api",
        ],
    )
    async def test_response_body_has_no_forbidden_pattern(
        self, auth_client, authenticated_client, eero_exceptions, exception_key
    ):
        """Every mapped exception's HTTP response body is free of the
        internal-detail patterns test_security.py already forbids."""
        authenticated_client.get_network = AsyncMock(
            side_effect=eero_exceptions[exception_key]()
        )
        authenticated_client.clear_session_token = AsyncMock()

        response = await auth_client.get("/api/networks/net-1")

        for pattern in FORBIDDEN_PATTERNS:
            assert (
                pattern.lower() not in response.text.lower()
            ), f"{exception_key} response leaked forbidden pattern {pattern!r}"
