"""Tests for authentication routes.

Tests cover:
- Auth status checking
- Login flow initiation
- Verification code handling
- Logout functionality
- Error scenarios
"""

from pathlib import Path
from unittest.mock import AsyncMock

from eero.exceptions import EeroAuthenticationException, EeroNetworkException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


# ``GET /account`` ``data`` with the shape captured live on 2026-10-08
# (eero-api 8.0.6) and synthetic values. Unrelated keys trimmed.
LIVE_SHAPED_ACCOUNT = {
    "name": "Test User",
    "phone": {
        "value": "+15555550100",
        "country_code": "1",
        "national_number": "5555550100",
        "verified": True,
    },
    "email": {"value": "user@example.com", "verified": True},
    "log_id": "0000000000000",
    "networks": {"count": 1, "data": [{"url": "/2.2/networks/1", "name": "Home"}]},
    "role": "full",
    "premium_status": "not_subscribed",
    "consents": {"marketing_emails": {"consented": True}},
}


class TestAuthStatus:
    """Tests for GET /api/auth/status."""

    async def test_status_unauthenticated(self, async_client, mock_eero_client):
        """Returns authenticated=false, reason='none' when not logged in."""
        mock_eero_client.is_authenticated = False

        response = await async_client.get("/api/auth/status")

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False
        assert data["reason"] == "none"
        assert data["preferred_network_id"] is None

    async def test_status_expired_session_clears_token(
        self, auth_client, authenticated_client
    ):
        """An EeroAuthenticationException from the probe reports reason='expired'
        and clears the stored token (phase-6.0-revamp.md § 4.1).

        ``clear_client_session()`` acts on the module-level EeroClient
        singleton in ``app.deps``, not the dependency-overridden fixture, so
        the singleton is pointed at the fixture for the duration of the test.
        """
        from app import deps

        authenticated_client.get_account = AsyncMock(
            side_effect=EeroAuthenticationException("session dead")
        )
        authenticated_client.clear_session_token = AsyncMock()
        deps._client = authenticated_client
        try:
            response = await auth_client.get("/api/auth/status")
        finally:
            deps._client = None

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False
        assert data["reason"] == "expired"
        authenticated_client.clear_session_token.assert_awaited_once()

    async def test_status_authenticated(self, auth_client, authenticated_client):
        """Returns the profile from the real ``GET /account`` shape: top-level
        ``name``, ``email``/``phone`` as ``{"value", ...}`` objects and consent
        under ``consents.marketing_emails``. A guessed ``users[]`` fixture
        kept this test green while the Account page showed "—" everywhere."""
        authenticated_client.get_account = AsyncMock(
            return_value=make_raw_response(LIVE_SHAPED_ACCOUNT)
        )

        response = await auth_client.get("/api/auth/status")

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["user_name"] == "Test User"
        assert data["user_email"] == "user@example.com"
        assert data["user_phone"] == "+15555550100"
        assert data["user_role"] == "full"
        assert data["premium_status"] == "not_subscribed"
        assert data["marketing_emails_consent"] is True
        # The live account carries no ``url``, so there is no id to derive.
        assert data["account_id"] is None

    async def test_status_reads_consent_opt_out(
        self, auth_client, authenticated_client
    ):
        """``consented: false`` is reported as false, not as unknown."""
        account = {
            **LIVE_SHAPED_ACCOUNT,
            "consents": {"marketing_emails": {"consented": False}},
        }
        authenticated_client.get_account = AsyncMock(
            return_value=make_raw_response(account)
        )

        response = await auth_client.get("/api/auth/status")

        assert response.json()["marketing_emails_consent"] is False

    async def test_status_account_probe_failure_keeps_session(
        self, auth_client, authenticated_client
    ):
        """A non-auth failure of the probe stays authenticated with no profile."""
        authenticated_client.get_account = AsyncMock(
            side_effect=EeroNetworkException("timeout")
        )

        response = await auth_client.get("/api/auth/status")

        data = response.json()
        assert data["authenticated"] is True
        assert data["reason"] is None
        assert data["user_name"] is None
        assert data["marketing_emails_consent"] is None

    async def test_status_with_int_preferred_network_id(
        self, auth_client, authenticated_client
    ):
        """An integer preferred id from the SDK does not 500 the status route (#415)."""
        authenticated_client.get_account = AsyncMock(return_value=make_raw_response({}))
        authenticated_client.preferred_network_id = 12345678

        response = await auth_client.get("/api/auth/status")

        assert response.status_code == 200
        assert response.json()["preferred_network_id"] == "12345678"


class TestLogin:
    """Tests for POST /api/auth/login."""

    async def test_login_success(self, async_client, mock_eero_client):
        """Successful login returns success message."""
        mock_eero_client.login = AsyncMock(return_value=make_raw_response({}))

        response = await async_client.post(
            "/api/auth/login", json={"identifier": "user@example.com"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "verification" in data["message"].lower()

    async def test_login_failure(self, async_client, mock_eero_client):
        """Failed login returns success=false."""
        # Return a failed response (code != 200)
        mock_eero_client.login = AsyncMock(
            return_value={"meta": {"code": 400}, "data": {}}
        )

        response = await async_client.post(
            "/api/auth/login", json={"identifier": "user@example.com"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False

    async def test_login_invalid_credentials(self, async_client, mock_eero_client):
        """Invalid credentials return 401."""
        mock_eero_client.login = AsyncMock(
            side_effect=EeroAuthenticationException("Invalid identifier")
        )

        response = await async_client.post(
            "/api/auth/login", json={"identifier": "invalid"}
        )

        assert response.status_code == 401

    async def test_login_401_is_never_mapped_as_an_expired_session(
        self, async_client, mock_eero_client
    ):
        """login's own except-clause handles EeroAuthenticationException
        locally (phase-6.0-revamp.md § 3.4): the response must not carry
        the ``reason: "expired"`` shape the global 401 handler produces,
        and no token-clearing call happens, since there was never a live
        session here to clear."""
        mock_eero_client.login = AsyncMock(
            side_effect=EeroAuthenticationException("Invalid identifier")
        )
        mock_eero_client.clear_session_token = AsyncMock()

        response = await async_client.post(
            "/api/auth/login", json={"identifier": "invalid"}
        )

        assert response.status_code == 401
        body = response.json()
        assert "reason" not in body
        assert body["detail"] == "Authentication failed. Please check your credentials."
        mock_eero_client.clear_session_token.assert_not_called()

    async def test_login_network_error(self, async_client, mock_eero_client):
        """Network error returns 503."""
        mock_eero_client.login = AsyncMock(
            side_effect=EeroNetworkException("Network error")
        )

        response = await async_client.post(
            "/api/auth/login", json={"identifier": "user@example.com"}
        )

        assert response.status_code == 503

    async def test_login_missing_identifier(self, async_client):
        """Missing identifier returns 422 validation error."""
        response = await async_client.post("/api/auth/login", json={})

        assert response.status_code == 422


class TestVerify:
    """Tests for POST /api/auth/verify."""

    async def test_verify_success(self, async_client, mock_eero_client):
        """Successful verification returns success with network ID."""
        mock_eero_client.verify = AsyncMock(return_value=make_raw_response({}))
        mock_eero_client.preferred_network_id = "network-123"

        response = await async_client.post("/api/auth/verify", json={"code": "123456"})

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["preferred_network_id"] == "network-123"

    async def test_verify_success_with_int_network_id(
        self, async_client, mock_eero_client
    ):
        """An integer preferred id from the SDK is returned as a string (#415)."""
        mock_eero_client.verify = AsyncMock(return_value=make_raw_response({}))
        mock_eero_client.preferred_network_id = 12345678

        response = await async_client.post("/api/auth/verify", json={"code": "123456"})

        assert response.status_code == 200
        assert response.json()["preferred_network_id"] == "12345678"

    async def test_verify_failure(self, async_client, mock_eero_client):
        """Failed verification returns success=false."""
        mock_eero_client.verify = AsyncMock(
            return_value={"meta": {"code": 400}, "data": {}}
        )

        response = await async_client.post("/api/auth/verify", json={"code": "wrong"})

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False

    async def test_verify_invalid_code(self, async_client, mock_eero_client):
        """Invalid code returns 401."""
        mock_eero_client.verify = AsyncMock(
            side_effect=EeroAuthenticationException("Invalid code")
        )

        response = await async_client.post("/api/auth/verify", json={"code": "invalid"})

        assert response.status_code == 401

    async def test_verify_401_is_never_mapped_as_an_expired_session(
        self, async_client, mock_eero_client
    ):
        """Same guarantee as login: verify's local except-clause must not
        produce the global handler's ``reason: "expired"`` shape, and must
        not clear a token (phase-6.0-revamp.md § 3.4)."""
        mock_eero_client.verify = AsyncMock(
            side_effect=EeroAuthenticationException("Invalid code")
        )
        mock_eero_client.clear_session_token = AsyncMock()

        response = await async_client.post("/api/auth/verify", json={"code": "invalid"})

        assert response.status_code == 401
        body = response.json()
        assert "reason" not in body
        assert body["detail"] == "Invalid verification code. Please try again."
        mock_eero_client.clear_session_token.assert_not_called()


class TestLogout:
    """Tests for POST /api/auth/logout."""

    async def test_logout_success(self, auth_client, authenticated_client):
        """Successful logout returns success."""
        authenticated_client.logout = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.post("/api/auth/logout")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    async def test_logout_handles_error_gracefully(
        self, auth_client, authenticated_client
    ):
        """Logout returns success even if API call fails."""
        authenticated_client.logout = AsyncMock(side_effect=Exception("API error"))

        response = await auth_client.post("/api/auth/logout")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    async def test_logout_removes_persisted_preferred_network(
        self, auth_client, authenticated_client
    ):
        """Logout removes the persisted preferred-network file (eero-ui#401)
        so a stale preference never outlives the session."""
        from app.config import settings

        authenticated_client.logout = AsyncMock(return_value=make_raw_response({}))

        pref_file = Path(settings.cookie_file).parent / "preferred-network.json"
        pref_file.parent.mkdir(parents=True, exist_ok=True)
        pref_file.write_text('{"network_id": "net-1"}')

        response = await auth_client.post("/api/auth/logout")

        assert response.status_code == 200
        assert not pref_file.exists()
        # The SDK keeps the in-memory preference across logout(); we reset it.
        authenticated_client.set_preferred_network.assert_called_once_with(None)

    async def test_logout_removes_preferred_network_when_file_absent(
        self, auth_client, authenticated_client
    ):
        """Logout is a no-op (not an error) when no preference was ever
        persisted."""
        authenticated_client.logout = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.post("/api/auth/logout")

        assert response.status_code == 200


class TestHealthCheck:
    """Tests for GET /api/health."""

    async def test_health_check(self, async_client):
        """Health check returns healthy status."""
        response = await async_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        # decision 6a: the frontend hides gated controls from this flag.
        assert data["experimental_writes"] is False
