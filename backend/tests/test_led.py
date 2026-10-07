"""Tests for LED read and brightness read-back (WP6 deliverable 4)."""

from typing import Any, ClassVar
from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestGetEeroLed:
    """Tests for GET /api/eeros/{eero_id}/led."""

    async def test_returns_status(self, auth_client, authenticated_client):
        authenticated_client.get_led_status = AsyncMock(
            return_value=make_raw_response({"led_on": True, "led_brightness": 75})
        )

        response = await auth_client.get("/api/eeros/eero-1/led")

        assert response.status_code == 200
        assert response.json() == {"led_on": True, "led_brightness": 75}
        authenticated_client.get_led_status.assert_called_once_with(
            "eero-1", network_id="network-123"
        )


class TestSetEeroLedBrightness:
    """Tests for PUT /api/eeros/{eero_id}/led/brightness."""

    async def test_sets_and_reads_back(self, auth_client, authenticated_client):
        authenticated_client.set_led_brightness = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_led_status = AsyncMock(
            return_value=make_raw_response({"led_on": True, "led_brightness": 42})
        )

        response = await auth_client.put(
            "/api/eeros/eero-1/led/brightness", params={"brightness": 42}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["led_brightness"] == 42
        authenticated_client.set_led_brightness.assert_called_once_with(
            "eero-1", brightness=42, network_id="network-123"
        )
        authenticated_client.get_led_status.assert_called_once_with(
            "eero-1", network_id="network-123"
        )

    async def test_out_of_range_rejected(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/eeros/eero-1/led/brightness", params={"brightness": 101}
        )

        assert response.status_code == 422
        authenticated_client.set_led_brightness.assert_not_called()

    async def test_negative_rejected(self, auth_client, authenticated_client):
        response = await auth_client.put(
            "/api/eeros/eero-1/led/brightness", params={"brightness": -1}
        )

        assert response.status_code == 422
        authenticated_client.set_led_brightness.assert_not_called()


class TestEeroConnections:
    """Tests for GET /api/eeros/{eero_id}/connections."""

    async def test_returns_connections(self, auth_client, authenticated_client):
        authenticated_client.get_connections = AsyncMock(
            return_value=make_raw_response(
                {
                    "connections": [
                        {
                            "url": "/2.2/eeros/eero-1/connections/dev-1",
                            "mac": "aa:bb:cc:dd:ee:ff",
                            "ip": "192.168.1.50",
                            "nickname": "Laptop",
                            "connectivity": {"signal": -55, "frequency": 5180},
                            "last_active": "2026-09-24T00:00:00Z",
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/eeros/eero-1/connections")

        assert response.status_code == 200
        assert response.json() == {
            "connections": [
                {
                    "id": "dev-1",
                    "url": "/2.2/eeros/eero-1/connections/dev-1",
                    "mac": "aa:bb:cc:dd:ee:ff",
                    "ip": "192.168.1.50",
                    "nickname": "Laptop",
                    "hostname": None,
                    "display_name": "Laptop",
                    "connection_type": None,
                    "band": "5GHz",
                    "signal": -55,
                    "last_active": "2026-09-24T00:00:00Z",
                    "kind": None,
                    "entity_type": None,
                    "device_type": None,
                    "port": None,
                    "is_upstream": None,
                    "negotiated_speed": None,
                    "location": None,
                    "model_name": None,
                }
            ]
        }
        authenticated_client.get_connections.assert_called_once_with(
            "eero-1", network_id="network-123"
        )

    async def test_unknown_and_sensitive_keys_dropped(
        self, auth_client, authenticated_client
    ):
        """L3: the upstream shape is unfixtured - allowlisted fields pass
        through, everything else (including a PSK-shaped key) is dropped."""
        authenticated_client.get_connections = AsyncMock(
            return_value=make_raw_response(
                {
                    "connections": [
                        {
                            "mac": "aa:bb:cc:dd:ee:ff",
                            "network_key": "should-never-appear",
                            "unexpected_field": "dropped",
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/eeros/eero-1/connections")

        assert response.status_code == 200
        assert "network_key" not in response.text
        assert "should-never-appear" not in response.text
        assert "unexpected_field" not in response.text


class TestEeroConnectionsRealShape:
    """Tests for the real ``get_connections`` shape (bug #2, probed live
    2026-10-07): no top-level ``connections`` key at all -- clients are
    reported via ``wireless_devices`` and ``ports.interfaces[]``.
    """

    _REAL_PAYLOAD: ClassVar[dict[str, Any]] = {
        "provide_device_power": None,
        "node_actions": [],
        "ports": {
            "layout": {
                "position_rank_order": [0, 1],
                "layout_type": "TWO_PORT_A",
            },
            "interfaces": [
                {
                    "interface_number": 0,
                    "name": "1",
                    "negotiated_speed": "P1000",
                    "port_status": "DATA_CONNECTED",
                    "connection_status": {
                        "type": "EERO_DEVICE",
                        "metadata": {
                            "location": "Kitchen",
                            "model_name": "eero Max 7",
                            "url": "/2.2/eeros/26084978",
                        },
                    },
                    "is_upstream": True,
                },
                {
                    "interface_number": 1,
                    "name": "2",
                    "negotiated_speed": "P100",
                    "port_status": "DATA_CONNECTED",
                    "connection_status": {
                        "type": "CLIENT_DEVICE",
                        "metadata": {
                            "display_name": "fake-sprinkler-ctrl",
                            "device_type": "sprinkler",
                            "url": "/2.2/networks/net-1/devices/aabbccddeeff",
                        },
                    },
                    "is_upstream": False,
                },
                {
                    "interface_number": 2,
                    "name": "3",
                    "negotiated_speed": None,
                    "port_status": "DISCONNECTED",
                    "connection_status": {"type": "NOT_CONNECTED", "metadata": {}},
                    "is_upstream": False,
                },
            ],
        },
        "wireless_devices": [
            {
                "type": "CLIENT_DEVICE",
                "metadata": {
                    "display_name": "fake-google-home",
                    "device_type": "digital_assistant",
                    "url": "/2.2/networks/net-1/devices/112233445566",
                },
            },
        ],
    }

    async def test_merges_wireless_and_wired_connections(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_connections = AsyncMock(
            return_value=make_raw_response(self._REAL_PAYLOAD)
        )

        response = await auth_client.get("/api/eeros/eero-1/connections")

        assert response.status_code == 200
        data = response.json()
        connections = data["connections"]

        # 1 wireless + 2 wired (the NOT_CONNECTED port is skipped)
        assert len(connections) == 3

        wireless = [c for c in connections if c["kind"] == "wireless"]
        assert len(wireless) == 1
        assert wireless[0]["display_name"] == "fake-google-home"
        assert wireless[0]["entity_type"] == "client"
        assert wireless[0]["id"] == "112233445566"

        wired = [c for c in connections if c["kind"] == "wired"]
        assert len(wired) == 2
        eero_port = next(c for c in wired if c["entity_type"] == "eero")
        assert eero_port["location"] == "Kitchen"
        assert eero_port["model_name"] == "eero Max 7"
        assert eero_port["port"] == "1"
        assert eero_port["is_upstream"] is True
        assert eero_port["negotiated_speed"] == "P1000"

        client_port = next(c for c in wired if c["entity_type"] == "client")
        assert client_port["display_name"] == "fake-sprinkler-ctrl"
        assert client_port["device_type"] == "sprinkler"
        assert client_port["port"] == "2"
        assert client_port["is_upstream"] is False

    async def test_not_connected_port_skipped(self, auth_client, authenticated_client):
        authenticated_client.get_connections = AsyncMock(
            return_value=make_raw_response(self._REAL_PAYLOAD)
        )

        response = await auth_client.get("/api/eeros/eero-1/connections")

        ports = [c for c in response.json()["connections"] if c.get("port") == "3"]
        assert ports == []

    async def test_legacy_shape_still_used_when_no_real_keys_present(
        self, auth_client, authenticated_client
    ):
        """When neither ``wireless_devices`` nor ``ports`` is present,
        fall back to the legacy top-level ``connections`` list."""
        authenticated_client.get_connections = AsyncMock(
            return_value=make_raw_response(
                {
                    "connections": [
                        {
                            "mac": "aa:bb:cc:dd:ee:ff",
                            "nickname": "Legacy Laptop",
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/eeros/eero-1/connections")

        assert response.status_code == 200
        data = response.json()
        assert len(data["connections"]) == 1
        assert data["connections"][0]["nickname"] == "Legacy Laptop"
        assert data["connections"][0]["kind"] is None
