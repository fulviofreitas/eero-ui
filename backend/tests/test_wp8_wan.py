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
