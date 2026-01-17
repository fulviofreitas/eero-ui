"""Tests for authentication routes.

Tests cover:
- Auth status checking
- Login flow initiation
- Verification code handling
- Logout functionality
- Error scenarios
"""

from unittest.mock import AsyncMock, MagicMock

from eero.exceptions import EeroAuthenticationException, EeroNetworkException


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
        # Arrange: mock account data
        mock_user = MagicMock()
        mock_user.email = "user@example.com"
        mock_user.name = "Test User"
        mock_user.phone = "+1234567890"
        mock_user.role = "owner"

        mock_account = MagicMock()
        mock_account.id = "account-123"
        mock_account.premium_status = "premium"
        mock_account.users = [mock_user]

        authenticated_client.get_account = AsyncMock(return_value=mock_account)

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
        mock_eero_client.login = AsyncMock(return_value=True)

        response = await async_client.post(
            "/api/auth/login", json={"identifier": "user@example.com"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "verification" in data["message"].lower()

    async def test_login_failure(self, async_client, mock_eero_client):
        """Failed login returns success=false."""
        mock_eero_client.login = AsyncMock(return_value=False)

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
        mock_eero_client.verify = AsyncMock(return_value=True)
        mock_eero_client.preferred_network_id = "network-123"

        response = await async_client.post("/api/auth/verify", json={"code": "123456"})

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["preferred_network_id"] == "network-123"

    async def test_verify_failure(self, async_client, mock_eero_client):
        """Failed verification returns success=false."""
        mock_eero_client.verify = AsyncMock(return_value=False)

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
        authenticated_client.logout = AsyncMock(return_value=True)

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
