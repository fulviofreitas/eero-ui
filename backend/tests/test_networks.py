"""Tests for network routes."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


sample_network = {
    "url": "/2.2/networks/net-1",
    "name": "Home",
    "status": "online",
    "guest_network_enabled": False,
}


class TestListNetworks:
    """Tests for GET /api/networks."""

    async def test_list_networks_success(self, auth_client, authenticated_client):
        """Returns list of networks."""
        authenticated_client.get_networks = AsyncMock(
            return_value=make_raw_response([sample_network])
        )

        response = await auth_client.get("/api/networks")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == "Home"


class TestGetNetwork:
    """Tests for GET /api/networks/{network_id}."""

    async def test_get_network_success(self, auth_client, authenticated_client):
        """Returns network details."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(sample_network)
        )
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Home"
        assert data["status"] == "online"


class TestRenameNetwork:
    """Tests for PUT /api/networks/{network_id}/name."""

    async def test_rename_network_success(self, auth_client, authenticated_client):
        """Renames a network and returns success response."""
        authenticated_client.set_network_name = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["network_id"] == "net-1"
        assert data["name"] == "Home"
        authenticated_client.set_network_name.assert_called_once()

    async def test_rename_network_empty_name(self, auth_client, authenticated_client):
        """Empty name returns 400 without calling SDK."""
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "   "}
        )

        assert response.status_code == 400
        authenticated_client.set_network_name.assert_not_called()

    async def test_rename_network_eero_exception(
        self, auth_client, authenticated_client
    ):
        """EeroException returns 500."""
        authenticated_client.set_network_name = AsyncMock(
            side_effect=EeroException("rename failed")
        )

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home"}
        )

        assert response.status_code == 500


class TestToggleGuestNetwork:
    """Tests for PUT /api/networks/{network_id}/guest-network."""

    async def test_toggle_guest_network_enable_with_name(
        self, auth_client, authenticated_client
    ):
        """Enables guest network with a name and returns success."""
        authenticated_client.set_guest_network = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/guest-network",
            params={"enabled": "true", "name": "Guest"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["guest_network_enabled"] is True
