"""Tests for device routes.

Covers phase-6.0-revamp.md § 3.3 / decision 3: block and unblock resolve the
device's MAC address server-side before calling the SDK, since v8's
``block_device``/``unblock_device`` post ``mac=`` to the blacklist, not the
URL-derived device id.
"""

from unittest.mock import AsyncMock

from eero.exceptions import EeroNotFoundException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


def make_device(dev_id="device-1", mac="aa:bb:cc:dd:ee:ff", network_id="network-123"):
    """Build a raw device dict matching the eero API envelope shape."""
    return {
        "url": f"/2.2/networks/{network_id}/devices/{dev_id}",
        "mac": mac,
        "nickname": "My Phone",
        "connected": True,
        "wireless": True,
    }


class TestBlockDevice:
    """Tests for POST /api/devices/{device_id}/block.

    Unverified write (phase-6.0-revamp.md § 5): gated behind
    ``require_experimental_writes`` (decision 6a). Every test below opts
    into ``experimental_writes_enabled`` except the one asserting the
    default-disabled 403.
    """

    async def test_disabled_by_default_returns_403_experimental_disabled(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(make_device())
        )
        authenticated_client.block_device = AsyncMock()

        response = await auth_client.post("/api/devices/device-1/block")

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.block_device.assert_not_called()

    async def test_block_resolves_mac_and_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Block resolves the device's MAC, then calls block_device with it."""
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(make_device())
        )
        authenticated_client.block_device = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/devices/device-1/block")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["action"] == "block"
        authenticated_client.get_device.assert_called_once_with(
            "device-1", "network-123"
        )
        authenticated_client.block_device.assert_called_once_with(
            "aa:bb:cc:dd:ee:ff", network_id="network-123"
        )

    async def test_block_device_without_mac_returns_422(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """A device with no known MAC is rejected before any block call."""
        device_without_mac = make_device()
        device_without_mac["mac"] = None
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(device_without_mac)
        )
        authenticated_client.block_device = AsyncMock()

        response = await auth_client.post("/api/devices/device-1/block")

        assert response.status_code == 422
        assert response.json()["detail"] == "Device has no known MAC address."
        authenticated_client.block_device.assert_not_called()

    async def test_block_device_not_found(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """EeroNotFoundException while resolving the MAC maps to 404."""
        authenticated_client.get_device = AsyncMock(
            side_effect=EeroNotFoundException("device", "device-1")
        )

        response = await auth_client.post("/api/devices/device-1/block")

        assert response.status_code == 404


class TestUnblockDevice:
    """Tests for POST /api/devices/{device_id}/unblock."""

    async def test_unblock_resolves_mac_and_calls_sdk(
        self, auth_client, authenticated_client
    ):
        """Unblock resolves the device's MAC, then calls unblock_device with it."""
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(make_device())
        )
        authenticated_client.unblock_device = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/devices/device-1/unblock")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["action"] == "unblock"
        authenticated_client.unblock_device.assert_called_once_with(
            "aa:bb:cc:dd:ee:ff", network_id="network-123"
        )

    async def test_unblock_device_without_mac_returns_422(
        self, auth_client, authenticated_client
    ):
        """A device with no known MAC is rejected before any unblock call."""
        device_without_mac = make_device()
        device_without_mac["mac"] = None
        authenticated_client.get_device = AsyncMock(
            return_value=make_raw_response(device_without_mac)
        )
        authenticated_client.unblock_device = AsyncMock()

        response = await auth_client.post("/api/devices/device-1/unblock")

        assert response.status_code == 422
        authenticated_client.unblock_device.assert_not_called()


class TestSetDeviceNickname:
    """Tests for PUT /api/devices/{device_id}/nickname."""

    async def test_set_nickname_success(self, auth_client, authenticated_client):
        """Sets a nickname and calls the SDK with the stripped value."""
        authenticated_client.set_device_nickname = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/devices/device-1/nickname", json={"nickname": "  Kids Tablet  "}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        authenticated_client.set_device_nickname.assert_called_once_with(
            "device-1", "Kids Tablet", network_id="network-123"
        )

    async def test_set_nickname_empty_rejected(self, auth_client, authenticated_client):
        """A blank/whitespace-only nickname is rejected with 422."""
        authenticated_client.set_device_nickname = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/nickname", json={"nickname": "   "}
        )

        assert response.status_code == 422
        authenticated_client.set_device_nickname.assert_not_called()

    async def test_set_nickname_too_long_rejected(
        self, auth_client, authenticated_client
    ):
        """A nickname longer than 64 characters is rejected with 422."""
        authenticated_client.set_device_nickname = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/nickname", json={"nickname": "x" * 65}
        )

        assert response.status_code == 422
        authenticated_client.set_device_nickname.assert_not_called()

    async def test_set_nickname_max_length_allowed(
        self, auth_client, authenticated_client
    ):
        """Exactly 64 characters is accepted."""
        authenticated_client.set_device_nickname = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/devices/device-1/nickname", json={"nickname": "x" * 64}
        )

        assert response.status_code == 200
        authenticated_client.set_device_nickname.assert_called_once_with(
            "device-1", "x" * 64, network_id="network-123"
        )


class TestListDevicesRequiresAuth:
    """Auth boundary tests for the devices router."""

    async def test_list_devices_requires_auth(self, async_client, mock_eero_client):
        """Unauthenticated requests are rejected."""
        mock_eero_client.is_authenticated = False

        response = await async_client.get("/api/devices")

        assert response.status_code == 401
