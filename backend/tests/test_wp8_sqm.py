"""Tests for PUT /api/networks/{network_id}/sqm (WP8 family 1: SQM).

Settings-class write (phase-6.0-revamp.md § 5; sdk-surface-map-v8.0.3.md
WP8: `set_sqm` PUTs the network `settings` link). Gated behind its own
module constant `_SQM_GATE` (`require_experimental_writes`),
`@limiter.shared_limit("2/minute", scope="settings_writes")`.
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateSqm:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_sqm = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/sqm", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_sqm.assert_not_called()

    async def test_enables_sqm_when_changed(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_sqm_settings = AsyncMock(
            return_value=make_raw_response({"sqm": False})
        )
        authenticated_client.set_sqm = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/sqm", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        assert data["enabled"] is True
        authenticated_client.set_sqm.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_sqm_settings = AsyncMock(
            return_value=make_raw_response({"sqm": True})
        )
        authenticated_client.set_sqm = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/sqm", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is False
        assert data["enabled"] is True
        authenticated_client.set_sqm.assert_not_called()

    async def test_single_write_per_request(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_sqm_settings = AsyncMock(
            return_value=make_raw_response({"sqm": False})
        )
        authenticated_client.set_sqm = AsyncMock(return_value=make_raw_response({}))

        await auth_client.put("/api/networks/network-123/sqm", json={"enabled": True})

        assert authenticated_client.set_sqm.call_count == 1

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_sqm = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/sqm", json={"enabled": "not-a-bool"}
        )

        assert response.status_code == 422
        authenticated_client.set_sqm.assert_not_called()

    async def test_writes_when_current_value_unparseable(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S7): an unparseable ``sqm`` value is
        unknown, not False - requesting ``enabled=False`` must still write
        rather than being reported as a no-op."""
        authenticated_client.get_sqm_settings = AsyncMock(
            return_value=make_raw_response({"sqm": "not-a-bool-token"})
        )
        authenticated_client.set_sqm = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/sqm", json={"enabled": False}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        authenticated_client.set_sqm.assert_called_once_with(
            False, network_id="network-123"
        )
