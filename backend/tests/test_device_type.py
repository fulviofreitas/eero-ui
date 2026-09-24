"""Tests for PUT /api/devices/{device_id}/type (WP6 deliverable 5)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestSetDeviceType:
    """Tests for PUT /api/devices/{device_id}/type."""

    async def test_sets_device_type(self, auth_client, authenticated_client):
        authenticated_client.set_device_type = AsyncMock(
            return_value=make_raw_response({"device_type": "computer"})
        )

        response = await auth_client.put(
            "/api/devices/dev-1/type", json={"device_type": "computer"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["action"] == "device_type"
        authenticated_client.set_device_type.assert_called_once_with(
            "dev-1", "computer", network_id="network-123"
        )

    async def test_rejects_uppercase(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/devices/dev-1/type", json={"device_type": "Computer"}
        )

        assert response.status_code == 422
        authenticated_client.set_device_type.assert_not_called()

    async def test_rejects_special_characters(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/devices/dev-1/type", json={"device_type": "computer;drop"}
        )

        assert response.status_code == 422
        authenticated_client.set_device_type.assert_not_called()

    async def test_rejects_oversized_value(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/devices/dev-1/type", json={"device_type": "a" * 41}
        )

        assert response.status_code == 422
        authenticated_client.set_device_type.assert_not_called()

    async def test_accepts_underscore_token(self, auth_client, authenticated_client):
        authenticated_client.set_device_type = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/devices/dev-1/type", json={"device_type": "smart_speaker"}
        )

        assert response.status_code == 200
        authenticated_client.set_device_type.assert_called_once_with(
            "dev-1", "smart_speaker", network_id="network-123"
        )
