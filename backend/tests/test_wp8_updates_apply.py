"""Tests for WP8 family 11: firmware update apply.

POST /api/networks/{network_id}/updates/apply
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

from app.routes.networks import _last_update_applied


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


# ``_last_update_applied`` is a module-level singleton reset before/after
# every test session-wide by conftest.py's ``_reset_networks_module_state``
# autouse fixture -- no file-local reset needed here.


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

    async def test_cooldown_rejects_second_apply_within_window(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S6): a second apply within the
        30-minute cooldown 409s without a second reboot-class POST."""
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": True})
        )
        authenticated_client.apply_update = AsyncMock(
            return_value=make_raw_response({})
        )

        first = await auth_client.post("/api/networks/network-123/updates/apply")
        assert first.status_code == 200

        second = await auth_client.post("/api/networks/network-123/updates/apply")

        assert second.status_code == 409
        assert second.json()["type"] == "update_in_progress"
        assert authenticated_client.apply_update.call_count == 1

    async def test_cooldown_is_per_network(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": True})
        )
        authenticated_client.apply_update = AsyncMock(
            return_value=make_raw_response({})
        )

        first = await auth_client.post("/api/networks/network-123/updates/apply")
        second = await auth_client.post("/api/networks/network-456/updates/apply")

        assert first.status_code == 200
        assert second.status_code == 200
        assert authenticated_client.apply_update.call_count == 2

    async def test_cooldown_expires_after_window(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": True})
        )
        authenticated_client.apply_update = AsyncMock(
            return_value=make_raw_response({})
        )
        _last_update_applied["network-123"] = datetime.now(UTC) - timedelta(
            seconds=31 * 60
        )

        response = await auth_client.post("/api/networks/network-123/updates/apply")

        assert response.status_code == 200
        authenticated_client.apply_update.assert_called_once()

    async def test_in_progress_status_field_rejected_without_write(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Best-effort guard (S6): an ``updates`` envelope carrying a
        ``status: "in_progress"`` field is treated as already rolling out,
        even though no such field is documented in the SDK today."""
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": True, "status": "in_progress"})
        )
        authenticated_client.apply_update = AsyncMock()

        response = await auth_client.post("/api/networks/network-123/updates/apply")

        assert response.status_code == 409
        assert response.json()["type"] == "update_in_progress"
        authenticated_client.apply_update.assert_not_called()
