"""Tests for WP8 family 11: firmware update apply.

POST /api/networks/{network_id}/updates/apply
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestApplyNetworkUpdate:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.apply_update = AsyncMock()

        response = await auth_client.post("/api/networks/network-123/updates/apply")

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.apply_update.assert_not_called()

    async def test_applies_when_pending(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": True})
        )
        authenticated_client.apply_update = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/networks/network-123/updates/apply")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        assert data["scope"] == "all_nodes"
        authenticated_client.apply_update.assert_called_once_with("network-123")

    async def test_no_op_guard_409_when_no_update_pending(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": False})
        )
        authenticated_client.apply_update = AsyncMock()

        response = await auth_client.post("/api/networks/network-123/updates/apply")

        assert response.status_code == 409
        assert response.json()["type"] == "no_update_available"
        authenticated_client.apply_update.assert_not_called()

    async def test_single_write_per_request(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": True})
        )
        authenticated_client.apply_update = AsyncMock(
            return_value=make_raw_response({})
        )

        await auth_client.post("/api/networks/network-123/updates/apply")

        assert authenticated_client.apply_update.call_count == 1
