"""Tests for WP8 family 2: DHCP, connection mode, NAT port randomization.

PUT /api/networks/{network_id}/dhcp
PUT /api/networks/{network_id}/connection-mode
PUT /api/networks/{network_id}/nat-port-randomization

All three PUT the network `settings` link (sdk-surface-map-v8.0.3.md
headline finding 1) and carry the reboot warning per decision 5. Each has
its own gate constant (`_DHCP_GATE`, `_CONNECTION_MODE_GATE`,
`_NAT_PORT_RANDOMIZATION_GATE`).
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateDhcp:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp", json={"mode": "automatic"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_dhcp.assert_not_called()

    async def test_changes_mode_and_reads_back(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"dhcp": {"mode": "automatic"}}),
                make_raw_response({"dhcp": {"mode": "manual"}}),
            ]
        )
        authenticated_client.set_dhcp = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/dhcp", json={"mode": "manual"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        assert data["dhcp"] == {"mode": "manual"}
        authenticated_client.set_dhcp.assert_called_once_with(
            "network-123", mode="manual", custom=None
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"dhcp": {"mode": "automatic"}})
        )
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp", json={"mode": "automatic"}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.set_dhcp.assert_not_called()

    async def test_manual_custom_lease_validated(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "not-an-ip",
                    "end_ip": "192.168.1.100",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_empty_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put("/api/networks/network-123/dhcp", json={})

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_single_write_per_request(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"dhcp": {"mode": "automatic"}})
        )
        authenticated_client.set_dhcp = AsyncMock(return_value=make_raw_response({}))

        await auth_client.put("/api/networks/network-123/dhcp", json={"mode": "manual"})

        assert authenticated_client.set_dhcp.call_count == 1


class TestUpdateConnectionMode:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_connection_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "BRIDGE"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_connection_mode.assert_not_called()

    async def test_changes_mode_and_reads_back(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"connection_mode": "NAT"}),
                make_raw_response({"connection_mode": "BRIDGE"}),
            ]
        )
        authenticated_client.set_connection_mode = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "BRIDGE"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["mode"] == "BRIDGE"
        authenticated_client.set_connection_mode.assert_called_once_with(
            "BRIDGE", network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"connection_mode": "NAT"})
        )
        authenticated_client.set_connection_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "NAT"}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_connection_mode.assert_not_called()

    async def test_invalid_mode_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_connection_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "WPA3"}
        )

        assert response.status_code == 422
        authenticated_client.set_connection_mode.assert_not_called()


class TestUpdateNatPortRandomization:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_nat_port_randomization = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/nat-port-randomization",
            json={"enabled": True},
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_nat_port_randomization.assert_not_called()

    async def test_changes_when_key_present_and_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"nat_port_randomization": False})
        )
        authenticated_client.set_nat_port_randomization = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/nat-port-randomization",
            json={"enabled": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["enabled"] is True
        authenticated_client.set_nat_port_randomization.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_no_op_when_key_present_and_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"nat_port_randomization": True})
        )
        authenticated_client.set_nat_port_randomization = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/nat-port-randomization",
            json={"enabled": True},
        )

        assert response.json()["changed"] is False
        authenticated_client.set_nat_port_randomization.assert_not_called()

    async def test_writes_when_key_absent_from_envelope(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(return_value=make_raw_response({}))
        authenticated_client.set_nat_port_randomization = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/nat-port-randomization",
            json={"enabled": True},
        )

        assert response.json()["changed"] is True
        authenticated_client.set_nat_port_randomization.assert_called_once()

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_nat_port_randomization = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/nat-port-randomization",
            json={"enabled": "not-a-bool"},
        )

        assert response.status_code == 422
        authenticated_client.set_nat_port_randomization.assert_not_called()
