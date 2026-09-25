"""Tests for GET /api/networks/{network_id}/scan (WP6 deliverable 6)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestNetworkScan:
    """Tests for GET /api/networks/{network_id}/scan."""

    async def test_returns_scan_list(self, auth_client, authenticated_client):
        authenticated_client.get_network_scan = AsyncMock(
            return_value=make_raw_response({"scan": [{"channel": 6}]})
        )

        response = await auth_client.get("/api/networks/net-1/scan")

        assert response.status_code == 200
        assert response.json() == {"scan": [{"channel": 6}]}
        authenticated_client.get_network_scan.assert_called_once_with(
            network_id="net-1"
        )

    async def test_missing_scan_key_defaults_to_empty(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_network_scan = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get("/api/networks/net-1/scan")

        assert response.status_code == 200
        assert response.json() == {"scan": []}
