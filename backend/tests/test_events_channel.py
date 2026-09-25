"""Tests for events and channel-utilization routes (WP6 deliverable 9)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestNetworkEvents:
    """Tests for GET /api/networks/{network_id}/events."""

    async def test_returns_events(self, auth_client, authenticated_client):
        authenticated_client.get_app_events = AsyncMock(
            return_value=make_raw_response({"events": [{"type": "device_connected"}]})
        )

        response = await auth_client.get(
            "/api/networks/net-1/events", params={"page_size": 25}
        )

        assert response.status_code == 200
        assert response.json() == {"events": [{"type": "device_connected"}]}
        authenticated_client.get_app_events.assert_called_once_with(
            network_id="net-1", page_size=25, timestamp=None
        )

    async def test_invalid_timestamp_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/events", params={"timestamp": "not-a-date"}
        )

        assert response.status_code == 400
        authenticated_client.get_app_events.assert_not_called()

    async def test_page_size_out_of_bounds_rejected(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(
            "/api/networks/net-1/events", params={"page_size": 500}
        )

        assert response.status_code == 422
        authenticated_client.get_app_events.assert_not_called()


class TestChannelUtilization:
    """Tests for GET /api/networks/{network_id}/channel-utilization."""

    async def test_returns_raw_data(self, auth_client, authenticated_client):
        authenticated_client.get_channel_utilization = AsyncMock(
            return_value=make_raw_response({"utilization": []})
        )

        response = await auth_client.get(
            "/api/networks/net-1/channel-utilization",
            params={
                "start": "2026-07-01T00:00:00Z",
                "end": "2026-07-02T00:00:00Z",
                "band": "band_5GHz_low",
            },
        )

        assert response.status_code == 200
        assert response.json() == {"utilization": []}
        authenticated_client.get_channel_utilization.assert_called_once_with(
            network_id="net-1",
            start="2026-07-01T00:00:00Z",
            end="2026-07-02T00:00:00Z",
            band="band_5GHz_low",
            eero_id=None,
            granularity=None,
        )

    async def test_invalid_band_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/channel-utilization",
            params={
                "start": "2026-07-01T00:00:00Z",
                "end": "2026-07-02T00:00:00Z",
                "band": "not_a_band",
            },
        )

        assert response.status_code == 422
        authenticated_client.get_channel_utilization.assert_not_called()

    async def test_missing_required_params_rejected(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get("/api/networks/net-1/channel-utilization")

        assert response.status_code == 422
