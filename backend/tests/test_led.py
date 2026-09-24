"""Tests for LED read and brightness read-back (WP6 deliverable 4)."""

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
