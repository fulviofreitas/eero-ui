"""Tests for authentication routes.

Tests cover:
- Auth status checking
- Login flow initiation
- Verification code handling
- Logout functionality
- Error scenarios
"""

from unittest.mock import AsyncMock

from eero.exceptions import EeroAuthenticationException, EeroNetworkException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestAuthStatus:
    """Tests for GET /api/auth/status."""

    async def test_status_unauthenticated(self, async_client, mock_eero_client):
        """Returns authenticated=false when not logged in."""
        mock_eero_client.is_authenticated = False

        response = await async_client.get("/api/auth/status")

        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is False
        assert data["preferred_network_id"] is None

    async def test_status_authenticated(self, auth_client, authenticated_client):
        """Returns user info when authenticated."""
        # Arrange: mock account data as raw response
        mock_account_data = {
            "url": "/2.2/accounts/account-123",
            "premium_status": "premium",
            "users": [
                {
                    "email": "user@example.com",
                    "name": "Test User",
                    "phone": "+1234567890",
                    "role": "owner",
                }
            ],
        }
        authenticated_client.get_account = AsyncMock(
            return_value=make_raw_response(mock_account_data)
        )

        # Act
        response = await auth_client.get("/api/auth/status")

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["user_email"] == "user@example.com"
        assert data["user_name"] == "Test User"
        assert data["account_id"] == "account-123"
        assert data["premium_status"] == "premium"


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


class TestHealthCheck:
    """Tests for GET /api/health."""

    async def test_health_check(self, async_client):
        """Health check returns healthy status."""
        response = await async_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
