"""Tests for DDNS writes (phase-6.0-revamp.md WP7, family 4)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateDdns:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.enable_ddns = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/ddns", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.enable_ddns.assert_not_called()

    async def test_enabling_calls_enable_ddns(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"ddns": {"enabled": False}}),
                make_raw_response(
                    {"ddns": {"enabled": True, "url": "x.ddns.eero.com"}}
                ),
            ]
        )
        authenticated_client.enable_ddns = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/net-1/ddns", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["ddns"]["enabled"] is True
        authenticated_client.enable_ddns.assert_called_once_with(network_id="net-1")

    async def test_no_op_when_already_in_requested_state(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"ddns": {"enabled": True}})
        )
        authenticated_client.enable_ddns = AsyncMock()
        authenticated_client.disable_ddns = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/ddns", json={"enabled": True}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.enable_ddns.assert_not_called()
        authenticated_client.disable_ddns.assert_not_called()

    async def test_disabling_calls_disable_ddns(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            side_effect=[
                make_raw_response({"ddns": {"enabled": True}}),
                make_raw_response({"ddns": {"enabled": False}}),
            ]
        )
        authenticated_client.disable_ddns = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/ddns", json={"enabled": False}
        )

        assert response.status_code == 200
        authenticated_client.disable_ddns.assert_called_once_with(network_id="net-1")
