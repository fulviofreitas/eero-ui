"""Tests for guest network reads and password writes (WP6 deliverable 3)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestGetGuestNetwork:
    """Tests for GET /api/networks/{network_id}/guest."""

    async def test_returns_normalized_status(self, auth_client, authenticated_client):
        authenticated_client.get_guest_network = AsyncMock(
            return_value=make_raw_response(
                {"enabled": True, "name": "Guest Wifi", "password": "hunter22"}
            )
        )

        response = await auth_client.get("/api/networks/net-1/guest")

        assert response.status_code == 200
        data = response.json()
        assert data == {"enabled": True, "name": "Guest Wifi", "has_password": True}
        authenticated_client.get_guest_network.assert_called_once_with(
            network_id="net-1"
        )

    async def test_never_echoes_raw_password(self, auth_client, authenticated_client):
        """The response never contains the raw password value."""
        authenticated_client.get_guest_network = AsyncMock(
            return_value=make_raw_response(
                {"enabled": True, "name": "Guest", "password": "secret-value"}
            )
        )

        response = await auth_client.get("/api/networks/net-1/guest")

        assert "secret-value" not in response.text


class TestSetGuestPassword:
    """Tests for PUT /api/networks/{network_id}/guest/password."""

    async def test_sets_password_and_reads_back(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_guest_password = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_guest_network = AsyncMock(
            return_value=make_raw_response({"enabled": True, "name": "Guest"})
        )

        response = await auth_client.put(
            "/api/networks/net-1/guest/password", json={"password": "correcthorse"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["guest_network"]["enabled"] is True
        authenticated_client.set_guest_password.assert_called_once_with(
            "correcthorse", network_id="net-1"
        )
        authenticated_client.get_guest_network.assert_called_once_with(
            network_id="net-1"
        )

    async def test_too_short_rejected_before_sdk_call(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.put(
            "/api/networks/net-1/guest/password", json={"password": "short"}
        )

        assert response.status_code == 422
        authenticated_client.set_guest_password.assert_not_called()

    async def test_too_long_rejected(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/networks/net-1/guest/password", json={"password": "a" * 64}
        )

        assert response.status_code == 422
        authenticated_client.set_guest_password.assert_not_called()

    async def test_non_ascii_rejected(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/networks/net-1/guest/password", json={"password": "pässwörd1"}
        )

        assert response.status_code == 422
        authenticated_client.set_guest_password.assert_not_called()


class TestClearGuestPassword:
    """Tests for DELETE /api/networks/{network_id}/guest/password."""

    async def test_clears_password_and_reads_back(
        self, auth_client, authenticated_client
    ):
        authenticated_client.clear_guest_password = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_guest_network = AsyncMock(
            return_value=make_raw_response({"enabled": True, "name": "Guest"})
        )

        response = await auth_client.delete("/api/networks/net-1/guest/password")

        assert response.status_code == 200
        assert response.json()["success"] is True
        authenticated_client.clear_guest_password.assert_called_once_with(
            network_id="net-1"
        )
