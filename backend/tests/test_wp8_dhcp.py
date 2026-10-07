"""Tests for WP8 family 2: DHCP, connection mode, NAT port randomization.

PUT /api/networks/{network_id}/dhcp
PUT /api/networks/{network_id}/connection-mode
PUT /api/networks/{network_id}/nat-port-randomization

All three PUT the network `settings` link (sdk-surface-map-v8.0.3.md
headline finding 1) and carry the reboot warning per decision 5. Each has
its own gate constant (`_DHCP_GATE`, `_CONNECTION_MODE_GATE`,
`_NAT_PORT_RANDOMIZATION_GATE`).
"""

from typing import Any, ClassVar
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

    async def test_valid_custom_range_accepted(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S2): a well-formed RFC1918 range
        that excludes the router address is accepted."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"dhcp": {"mode": "automatic"}})
        )
        authenticated_client.set_dhcp = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "192.168.1.100",
                    "end_ip": "192.168.1.200",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 200
        authenticated_client.set_dhcp.assert_called_once()

    async def test_custom_range_rejects_ipv6(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "2001:db8::100",
                    "end_ip": "2001:db8::200",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_custom_range_rejects_public_subnet(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "8.8.8.100",
                    "end_ip": "8.8.8.200",
                    "subnet_ip": "8.8.8.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_custom_range_rejects_prefix_out_of_bounds(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "10.100.0.10",
                    "end_ip": "10.100.0.20",
                    "subnet_ip": "10.0.0.0",
                    "subnet_mask": "255.0.0.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_custom_range_rejects_start_after_end(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "192.168.1.200",
                    "end_ip": "192.168.1.100",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_custom_range_rejects_endpoint_outside_subnet(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "192.168.1.100",
                    "end_ip": "192.168.2.200",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_custom_range_rejects_router_address_in_range(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "custom": {
                    "start_ip": "192.168.1.1",
                    "end_ip": "192.168.1.200",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                }
            },
        )

        assert response.status_code == 422
        authenticated_client.set_dhcp.assert_not_called()

    async def test_dhcp_readback_strips_sensitive_keys(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S8): the DHCP read-back is a
        passthrough shape and must have credential-shaped keys stripped."""
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"dhcp": {"mode": "automatic"}}),
                make_raw_response(
                    {"dhcp": {"mode": "manual", "shared_secret": "sekret"}}
                ),
            ]
        )
        authenticated_client.set_dhcp = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/dhcp", json={"mode": "manual"}
        )

        assert response.status_code == 200
        assert "shared_secret" not in response.json()["dhcp"]


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
            "/api/networks/network-123/connection-mode",
            json={"mode": "BRIDGE", "acknowledge_disables_routing": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["mode"] == "BRIDGE"
        assert data["disables_dhcp_nat"] is True
        authenticated_client.set_connection_mode.assert_called_once_with(
            "BRIDGE", network_id="network-123"
        )

    async def test_bridge_without_acknowledgement_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S4): BRIDGE disables the network's
        own DHCP/NAT - the caller must acknowledge that explicitly."""
        authenticated_client.set_connection_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "BRIDGE"}
        )

        assert response.status_code == 422
        authenticated_client.set_connection_mode.assert_not_called()

    async def test_nat_mode_does_not_require_acknowledgement(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"connection_mode": "BRIDGE"}),
                make_raw_response({"connection_mode": "NAT"}),
            ]
        )
        authenticated_client.set_connection_mode = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "NAT"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["disables_dhcp_nat"] is False

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


class TestUpdateConnectionModeRealShape:
    """Tests for the real ``connection.mode`` shape (bug #3, probed live
    2026-10-07): there is no top-level ``connection_mode`` key, only
    ``connection: {"mode": "nat"|"bridge"}`` (lowercase). Before the fix,
    the no-op guard compared ``"NAT"`` against ``None`` and always
    reported "changed", which would have issued a real settings-class
    write (mesh reboot) for an unmodified Save.
    """

    async def test_no_op_when_unchanged_real_shape(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"connection": {"mode": "nat"}})
        )
        authenticated_client.set_connection_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode", json={"mode": "NAT"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is False
        assert data["mode"] == "NAT"
        authenticated_client.set_connection_mode.assert_not_called()

    async def test_changes_mode_real_shape(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"connection": {"mode": "nat"}}),
                make_raw_response({"connection": {"mode": "bridge"}}),
            ]
        )
        authenticated_client.set_connection_mode = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/connection-mode",
            json={"mode": "BRIDGE", "acknowledge_disables_routing": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["mode"] == "BRIDGE"
        authenticated_client.set_connection_mode.assert_called_once_with(
            "BRIDGE", network_id="network-123"
        )


class TestUpdateDhcpRealShape:
    """Tests for the real DHCP wire shape (bug #4, probed live
    2026-10-07): manual lease ranges are stored with ``mode: "custom"``,
    not ``"manual"``. Before the fix, an unmodified Save of Manual IP
    (body ``mode: "manual"`` against a stored ``mode: "custom"``) always
    registered as "changed" and would have issued a real settings-class
    write (mesh reboot).
    """

    _CURRENT_DHCP: ClassVar[dict[str, Any]] = {
        "mode": "custom",
        "custom": {
            "subnet_ip": "10.0.4.0",
            "subnet_mask": "255.255.252.0",
            "start_ip": "10.0.4.20",
            "end_ip": "10.0.5.254",
        },
        "custom_v2": None,
    }

    async def test_unmodified_manual_save_is_a_no_op(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"dhcp": self._CURRENT_DHCP})
        )
        authenticated_client.set_dhcp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "mode": "manual",
                "custom": {
                    "start_ip": "10.0.4.20",
                    "end_ip": "10.0.5.254",
                    "subnet_ip": "10.0.4.0",
                    "subnet_mask": "255.255.252.0",
                },
            },
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.set_dhcp.assert_not_called()

    async def test_changed_range_is_applied(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"dhcp": self._CURRENT_DHCP}),
                make_raw_response(
                    {
                        "dhcp": {
                            **self._CURRENT_DHCP,
                            "custom": {
                                **self._CURRENT_DHCP["custom"],
                                "end_ip": "10.0.6.254",
                            },
                        }
                    }
                ),
            ]
        )
        authenticated_client.set_dhcp = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/dhcp",
            json={
                "mode": "manual",
                "custom": {
                    "start_ip": "10.0.4.20",
                    "end_ip": "10.0.6.254",
                    "subnet_ip": "10.0.4.0",
                    "subnet_mask": "255.255.252.0",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        authenticated_client.set_dhcp.assert_called_once_with(
            "network-123",
            mode="manual",
            custom={
                "start_ip": "10.0.4.20",
                "end_ip": "10.0.6.254",
                "subnet_ip": "10.0.4.0",
                "subnet_mask": "255.255.252.0",
            },
        )

    async def test_automatic_mode_with_no_lease_range_normalizes(self):
        """``normalize_dhcp`` must keep ``mode`` even when there is no
        lease range (e.g. ``{"mode": "automatic", "custom": None}``)."""
        from app.transformers import normalize_dhcp

        result = normalize_dhcp({"mode": "automatic", "custom": None})

        assert result is not None
        assert result["mode"] == "automatic"


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
