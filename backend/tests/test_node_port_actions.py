"""Tests for node/port actions (phase-6.0-revamp.md WP7, family 6).

POST /api/eeros/{eero_id}/node-action and
POST /api/eeros/{eero_id}/ports/{port_number}/action - unverified,
non-settings writes (§ 5), gated behind require_experimental_writes.
"""

from unittest.mock import AsyncMock

from eero.api.eeros import _NODE_ACTIONS, _PORT_ACTIONS

from app.routes.eeros import NODE_ACTIONS, PORT_ACTIONS


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestActionSetsMirrorTheSdk:
    """The locally-mirrored action sets must never drift from the SDK's own
    (private) frozensets - sdk-surface-map-v8.0.3.md WP7."""

    def test_node_actions_match_sdk(self):
        assert NODE_ACTIONS == _NODE_ACTIONS

    def test_port_actions_match_sdk(self):
        assert PORT_ACTIONS == _PORT_ACTIONS


class TestNodeAction:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.node_action = AsyncMock()

        response = await auth_client.post(
            "/api/eeros/eero-1/node-action",
            json={"action": "POWER_CYCLE_ALL_PORTS"},
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.node_action.assert_not_called()

    async def test_power_cycle_calls_sdk_and_reports_no_reboot(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.node_action = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.post(
            "/api/eeros/eero-1/node-action",
            json={"action": "POWER_CYCLE_ALL_PORTS"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["reboots_node"] is False
        authenticated_client.node_action.assert_called_once_with(
            "eero-1", "POWER_CYCLE_ALL_PORTS", network_id="network-123"
        )

    async def test_reboot_variant_reports_reboots_node_true(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.node_action = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.post(
            "/api/eeros/eero-1/node-action",
            json={"action": "POWER_CYCLE_ALL_PORTS_AND_REBOOT"},
        )

        assert response.status_code == 200
        assert response.json()["reboots_node"] is True

    async def test_invalid_action_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.node_action = AsyncMock()

        response = await auth_client.post(
            "/api/eeros/eero-1/node-action", json={"action": "DELETE_EVERYTHING"}
        )

        assert response.status_code == 422
        authenticated_client.node_action.assert_not_called()


class TestPortAction:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.port_action = AsyncMock()

        response = await auth_client.post(
            "/api/eeros/eero-1/ports/1/action", json={"action": "DISABLE_PORT"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.port_action.assert_not_called()

    async def test_valid_action_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.port_action = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.post(
            "/api/eeros/eero-1/ports/1/action", json={"action": "DISABLE_POE"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["port_number"] == "1"
        authenticated_client.port_action.assert_called_once_with(
            "eero-1", "1", "DISABLE_POE", network_id="network-123"
        )

    async def test_invalid_action_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.port_action = AsyncMock()

        response = await auth_client.post(
            "/api/eeros/eero-1/ports/1/action", json={"action": "NOT_A_REAL_ACTION"}
        )

        assert response.status_code == 422
        authenticated_client.port_action.assert_not_called()
