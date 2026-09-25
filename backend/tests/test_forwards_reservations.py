"""Tests for forwards and reservations (phase-6.0-revamp.md WP7, family 8)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestListForwards:
    async def test_returns_forwards_not_gated(self, auth_client, authenticated_client):
        authenticated_client.get_forwards = AsyncMock(
            return_value=make_raw_response(
                [
                    {
                        "url": "/2.2/networks/net-1/forwards/fwd-1",
                        "client_port": 8080,
                        "gateway_port": 80,
                        "ip": "192.168.1.50",
                        "protocol": "tcp",
                        "enabled": True,
                    }
                ]
            )
        )

        response = await auth_client.get("/api/networks/net-1/forwards")

        assert response.status_code == 200
        assert response.json()["forwards"][0]["id"] == "fwd-1"


class TestCreateForward:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.create_forward = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "192.168.1.50",
                "protocol": "tcp",
            },
        )

        assert response.status_code == 403
        authenticated_client.create_forward.assert_not_called()

    async def test_valid_forward_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_forward = AsyncMock(
            return_value=make_raw_response(
                {
                    "url": "/2.2/networks/net-1/forwards/fwd-1",
                    "client_port": 8080,
                    "gateway_port": 80,
                    "ip": "192.168.1.50",
                    "protocol": "tcp",
                    "enabled": True,
                }
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "192.168.1.50",
                "protocol": "tcp",
            },
        )

        assert response.status_code == 201
        authenticated_client.create_forward.assert_called_once_with(
            {
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "192.168.1.50",
                "protocol": "tcp",
                "description": None,
                "enabled": True,
            },
            network_id="net-1",
        )

    async def test_invalid_port_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_forward = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 999999,
                "gateway_port": 80,
                "ip": "192.168.1.50",
                "protocol": "tcp",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_forward.assert_not_called()

    async def test_invalid_ip_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_forward = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "not-an-ip",
                "protocol": "tcp",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_forward.assert_not_called()

    async def test_invalid_protocol_rejected_by_pydantic(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "192.168.1.50",
                "protocol": "carrier-pigeon",
            },
        )

        assert response.status_code == 422

    async def test_public_ip_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: a forward's ip names a LAN client, so a public address is
        rejected."""
        authenticated_client.create_forward = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "8.8.8.8",
                "protocol": "tcp",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_forward.assert_not_called()

    async def test_control_char_in_description_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_forward = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/forwards",
            json={
                "client_port": 8080,
                "gateway_port": 80,
                "ip": "192.168.1.50",
                "protocol": "tcp",
                "description": "hello\x00world",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_forward.assert_not_called()


class TestDeleteForward:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_forward = AsyncMock()

        response = await auth_client.delete("/api/networks/net-1/forwards/fwd-1")

        assert response.status_code == 403
        authenticated_client.delete_forward.assert_not_called()

    async def test_deletes_forward(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_forward = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete("/api/networks/net-1/forwards/fwd-1")

        assert response.status_code == 200
        assert response.json()["success"] is True


class TestListReservations:
    async def test_returns_reservations_not_gated(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_reservations = AsyncMock(
            return_value=make_raw_response(
                [
                    {
                        "url": "/2.2/networks/net-1/reservations/res-1",
                        "ip": "192.168.1.100",
                        "mac": "aa:bb:cc:dd:ee:ff",
                    }
                ]
            )
        )

        response = await auth_client.get("/api/networks/net-1/reservations")

        assert response.status_code == 200
        assert response.json()["reservations"][0]["id"] == "res-1"


class TestCreateReservation:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.create_reservation = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/reservations",
            json={"ip": "192.168.1.100", "mac": "aa:bb:cc:dd:ee:ff"},
        )

        assert response.status_code == 403
        authenticated_client.create_reservation.assert_not_called()

    async def test_valid_reservation_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_reservation = AsyncMock(
            return_value=make_raw_response(
                {
                    "url": "/2.2/networks/net-1/reservations/res-1",
                    "ip": "192.168.1.100",
                    "mac": "aa:bb:cc:dd:ee:ff",
                }
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/reservations",
            json={"ip": "192.168.1.100", "mac": "AA:BB:CC:DD:EE:FF"},
        )

        assert response.status_code == 201
        authenticated_client.create_reservation.assert_called_once_with(
            {
                "ip": "192.168.1.100",
                "mac": "aa:bb:cc:dd:ee:ff",
                "description": None,
                "public_static_ip": None,
            },
            network_id="net-1",
        )

    async def test_invalid_mac_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_reservation = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/reservations",
            json={"ip": "192.168.1.100", "mac": "not-a-mac"},
        )

        assert response.status_code == 422
        authenticated_client.create_reservation.assert_not_called()

    async def test_public_ip_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: a reservation's ip names a LAN client, so a public address
        is rejected (public_static_ip is unaffected - it is intentionally
        public)."""
        authenticated_client.create_reservation = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/reservations",
            json={"ip": "8.8.8.8", "mac": "aa:bb:cc:dd:ee:ff"},
        )

        assert response.status_code == 422
        authenticated_client.create_reservation.assert_not_called()

    async def test_control_char_in_description_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_reservation = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/reservations",
            json={
                "ip": "192.168.1.100",
                "mac": "aa:bb:cc:dd:ee:ff",
                "description": "hello\x00world",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_reservation.assert_not_called()


class TestDeleteReservation:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_reservation = AsyncMock()

        response = await auth_client.delete("/api/networks/net-1/reservations/res-1")

        assert response.status_code == 403
        authenticated_client.delete_reservation.assert_not_called()

    async def test_deletes_with_delete_forwards_flag(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_reservation = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete(
            "/api/networks/net-1/reservations/res-1",
            params={"delete_forwards": "true"},
        )

        assert response.status_code == 200
        authenticated_client.delete_reservation.assert_called_once_with(
            "res-1", network_id="net-1", delete_forwards=True
        )
