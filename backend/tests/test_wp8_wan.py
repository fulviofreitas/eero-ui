"""Tests for WP8 family 10: WAN (multi-static-IP, secondary WAN).

PUT /api/networks/{network_id}/multistaticip     {config}
PUT /api/networks/{network_id}/secondary-wan     {devices}
PUT /api/devices/{device_id}/secondary-wan-access {deny}
"""

from unittest.mock import AsyncMock

from eero.exceptions import EeroNotFoundException


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateMultiStaticIp:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_changes_when_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": False})
        )
        authenticated_client.set_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.set_multistaticip.assert_called_once_with(
            {"enabled": True}, network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip", json={"enabled": True}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_missing_feature_404_treated_as_no_current_config(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_multistaticip = AsyncMock(
            side_effect=EeroNotFoundException(
                "multistaticip",
                "network-123",
                error_code="error.network.multistaticip_not_found",
            )
        )
        authenticated_client.set_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip", json={"enabled": True}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.set_multistaticip.assert_called_once()

    async def test_invalid_ip_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={
                "enabled": True,
                "multistaticip_settings": {
                    "router_ip": "not-an-ip",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                },
            },
        )

        assert response.status_code == 422
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_unknown_field_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={"enabled": True, "bogus": "value"},
        )

        assert response.status_code == 422
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_unknown_type_value_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S9): ``type`` is a Literal allowlist
        built from the SDK's own test fixtures - ``"P"`` is the only
        documented value."""
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={"enabled": True, "type": "not-a-real-type"},
        )

        assert response.status_code == 422
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_documented_type_value_accepted(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": False})
        )
        authenticated_client.set_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True, "type": "P"})
        )

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={"enabled": True, "type": "P"},
        )

        assert response.status_code == 200
        authenticated_client.set_multistaticip.assert_called_once_with(
            {"enabled": True, "type": "P"}, network_id="network-123"
        )

    async def test_router_ip_outside_subnet_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S9): reuses the IPv4Network
        discipline from the DHCP custom range - ``router_ip`` must fall
        within ``subnet_ip``/``subnet_mask``."""
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={
                "enabled": True,
                "multistaticip_settings": {
                    "router_ip": "10.0.0.1",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                },
            },
        )

        assert response.status_code == 422
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_router_ip_within_subnet_accepted(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": False})
        )
        authenticated_client.set_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={
                "enabled": True,
                "multistaticip_settings": {
                    "router_ip": "192.168.1.1",
                    "subnet_ip": "192.168.1.0",
                    "subnet_mask": "255.255.255.0",
                },
            },
        )

        assert response.status_code == 200
        authenticated_client.set_multistaticip.assert_called_once()

    async def test_nat_portfwd_start_after_end_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_multistaticip = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip",
            json={
                "enabled": True,
                "multistaticip_settings_nat_portfwd": {
                    "subnet_ip_start": "192.168.1.200",
                    "subnet_ip_end": "192.168.1.100",
                },
            },
        )

        assert response.status_code == 422
        authenticated_client.set_multistaticip.assert_not_called()

    async def test_readback_strips_sensitive_keys(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S8)."""
        authenticated_client.get_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": False})
        )
        authenticated_client.set_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True, "shared_secret": "sekret"})
        )

        response = await auth_client.put(
            "/api/networks/network-123/multistaticip", json={"enabled": True}
        )

        assert response.status_code == 200
        assert "shared_secret" not in response.json()["config"]


class TestUpdateSecondaryWanConfig:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_secondary_wan_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/secondary-wan",
            json={
                "devices": [
                    {"mac": "aa:bb:cc:dd:ee:ff", "secondary_wan_deny_access": True}
                ]
            },
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_secondary_wan_config.assert_not_called()

    async def test_always_writes_no_reliable_guard(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_secondary_wan_config = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/secondary-wan",
            json={
                "devices": [
                    {"mac": "aa:bb:cc:dd:ee:ff", "secondary_wan_deny_access": True}
                ]
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.set_secondary_wan_config.assert_called_once_with(
            {
                "devices": [
                    {"mac": "aa:bb:cc:dd:ee:ff", "secondary_wan_deny_access": True}
                ]
            },
            network_id="network-123",
        )

    async def test_empty_devices_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_secondary_wan_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/secondary-wan", json={"devices": []}
        )

        assert response.status_code == 422
        authenticated_client.set_secondary_wan_config.assert_not_called()

    async def test_invalid_mac_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_secondary_wan_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/secondary-wan",
            json={"devices": [{"mac": "not-a-mac", "secondary_wan_deny_access": True}]},
        )

        assert response.status_code == 422
        authenticated_client.set_secondary_wan_config.assert_not_called()

    async def test_readback_strips_sensitive_keys(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S8)."""
        authenticated_client.set_secondary_wan_config = AsyncMock(
            return_value=make_raw_response(
                {"devices": [], "join_token": "sekret-token"}
            )
        )

        response = await auth_client.put(
            "/api/networks/network-123/secondary-wan",
            json={
                "devices": [
                    {"mac": "aa:bb:cc:dd:ee:ff", "secondary_wan_deny_access": True}
                ]
            },
        )

        assert response.status_code == 200
        assert "join_token" not in response.json()["config"]


class TestUpdateDeviceSecondaryWanAccess:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_device_secondary_wan_access = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/secondary-wan-access", json={"deny": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_device_secondary_wan_access.assert_not_called()

    async def test_changes_when_known_and_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(
                {
                    "url": "/2.2/networks/network-123/devices/aa:bb:cc:dd:ee:ff",
                    "mac": "aa:bb:cc:dd:ee:ff",
                    "secondary_wan_deny_access": False,
                }
            )
        )
        authenticated_client.set_device_secondary_wan_access = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/devices/device-1/secondary-wan-access", json={"deny": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.set_device_secondary_wan_access.assert_called_once_with(
            "aa:bb:cc:dd:ee:ff", deny=True, network_id="network-123"
        )

    async def test_no_op_when_known_and_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(
                {
                    "url": "/2.2/networks/network-123/devices/aa:bb:cc:dd:ee:ff",
                    "mac": "aa:bb:cc:dd:ee:ff",
                    "secondary_wan_deny_access": True,
                }
            )
        )
        authenticated_client.set_device_secondary_wan_access = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/secondary-wan-access", json={"deny": True}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_device_secondary_wan_access.assert_not_called()

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_device_secondary_wan_access = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/secondary-wan-access", json={"deny": "not-a-bool"}
        )

        assert response.status_code == 422
        authenticated_client.set_device_secondary_wan_access.assert_not_called()
