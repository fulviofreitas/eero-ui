"""Tests for permissions/members/invites reads (WP6 deliverable 10)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroAccessDeniedException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestPermissions:
    """Tests for GET /api/networks/{network_id}/permissions."""

    async def test_returns_permissions(self, auth_client, authenticated_client):
        authenticated_client.get_permissions = AsyncMock(
            return_value=make_raw_response(
                {"permissions": {"network.admin_invites": True}, "role": "OWNER"}
            )
        )

        response = await auth_client.get("/api/networks/net-1/permissions")

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "OWNER"
        assert data["permissions"] == {"network.admin_invites": True}
        assert data["partial"] is False

    async def test_access_denied_fails_soft(self, auth_client, authenticated_client):
        authenticated_client.get_permissions = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/permissions")

        assert response.status_code == 200
        data = response.json()
        assert data["partial"] is True
        assert data["permissions"] == {}


class TestMembers:
    """Tests for GET /api/networks/{network_id}/members."""

    async def test_returns_members(self, auth_client, authenticated_client):
        authenticated_client.get_members = AsyncMock(
            return_value=make_raw_response({"members": [{"user_name": "alice"}]})
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        assert response.json() == {
            "members": [{"user_name": "alice"}],
            "partial": False,
        }

    async def test_access_denied_fails_soft(self, auth_client, authenticated_client):
        authenticated_client.get_members = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        assert response.json() == {"members": [], "partial": True}


class TestInvites:
    """Tests for GET /api/networks/{network_id}/invites."""

    async def test_returns_invites(self, auth_client, authenticated_client):
        authenticated_client.get_invites = AsyncMock(
            return_value=make_raw_response({"invites": [{"invite_id": "inv-1"}]})
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        assert response.json() == {
            "invites": [{"invite_id": "inv-1"}],
            "partial": False,
        }

    async def test_access_denied_fails_soft(self, auth_client, authenticated_client):
        """403 from get_invites (some accounts) never fails the route."""
        authenticated_client.get_invites = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        assert response.json() == {"invites": [], "partial": True}
