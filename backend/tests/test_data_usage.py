"""Tests for the data-usage route family (WP6 deliverable 8)."""

from typing import Any, ClassVar
from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


START = "2026-07-01T00:00:00Z"
END = "2026-07-02T00:00:00Z"


class TestNetworkDataUsage:
    """Tests for GET /api/networks/{network_id}/data-usage."""

    async def test_returns_normalized_payload(self, auth_client, authenticated_client):
        authenticated_client.get_data_usage = AsyncMock(
            return_value=make_raw_response({"download": 100, "upload": 50})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["download_bytes"] == 100
        assert data["upload_bytes"] == 50
        authenticated_client.get_data_usage.assert_called_once_with(
            network_id="net-1", start=START, end=END, cadence="daily", timezone=None
        )

    async def test_cadence_required(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage", params={"start": START, "end": END}
        )

        assert response.status_code == 422
        authenticated_client.get_data_usage.assert_not_called()

    async def test_invalid_cadence_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={"start": START, "end": END, "cadence": "weekly"},
        )

        assert response.status_code == 422
        authenticated_client.get_data_usage.assert_not_called()

    async def test_end_before_start_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={"start": END, "end": START, "cadence": "daily"},
        )

        assert response.status_code == 400
        authenticated_client.get_data_usage.assert_not_called()


class TestDataUsageBreakdown:
    """Tests for GET /api/networks/{network_id}/data-usage/breakdown."""

    async def test_cadence_optional(self, auth_client, authenticated_client):
        authenticated_client.get_data_usage_breakdown = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/breakdown",
            params={"start": START, "end": END},
        )

        assert response.status_code == 200
        authenticated_client.get_data_usage_breakdown.assert_called_once_with(
            network_id="net-1", start=START, end=END, cadence=None, timezone=None
        )


class TestDeviceDataUsage:
    """Tests for GET /api/networks/{network_id}/data-usage/devices/{mac}."""

    async def test_valid_mac_normalized_to_lowercase(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_device_data_usage = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/devices/AA:BB:CC:DD:EE:FF",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        authenticated_client.get_device_data_usage.assert_called_once_with(
            "aa:bb:cc:dd:ee:ff",
            network_id="net-1",
            start=START,
            end=END,
            cadence="daily",
            timezone=None,
        )

    async def test_invalid_mac_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage/devices/not-a-mac",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 400
        authenticated_client.get_device_data_usage.assert_not_called()


class TestEeroDataUsageRouting:
    """Tests that /eeros/summary is not captured by /eeros/{eero_id}."""

    async def test_summary_route_wins_over_id_route(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_eeros_data_usage_summary = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/eeros/summary",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        authenticated_client.get_eeros_data_usage_summary.assert_called_once_with(
            network_id="net-1", start=START, end=END, cadence="daily", timezone=None
        )
        authenticated_client.get_eero_data_usage.assert_not_called()

    async def test_eero_id_route_still_works(self, auth_client, authenticated_client):
        authenticated_client.get_eero_data_usage = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/eeros/eero-1",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        authenticated_client.get_eero_data_usage.assert_called_once_with(
            "eero-1",
            network_id="net-1",
            start=START,
            end=END,
            cadence="daily",
            timezone=None,
        )


class TestProfileDataUsage:
    """Tests for GET /api/networks/{network_id}/data-usage/profiles/{profile_id}."""

    async def test_returns_normalized_payload(self, auth_client, authenticated_client):
        authenticated_client.get_profile_data_usage = AsyncMock(
            return_value=make_raw_response({"down": 10, "up": 5})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/profiles/profile-1",
            params={"start": START, "end": END, "cadence": "hourly"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["download_bytes"] == 10
        assert data["upload_bytes"] == 5
        authenticated_client.get_profile_data_usage.assert_called_once_with(
            "profile-1",
            network_id="net-1",
            start=START,
            end=END,
            cadence="hourly",
            timezone=None,
        )


class TestRealSeriesShape:
    """Tests for the real API's ``series`` shape (bug #1, probed live
    2026-10-07): there is no top-level ``download``/``upload``/``values``
    key, only ``series: [{"type": "upload"|"download", "sum", "values":
    [{"time", "value"}, ...]}]``.
    """

    _SERIES_PAYLOAD: ClassVar[dict[str, Any]] = {
        "start": "2026-09-30T00:00:00Z",
        "end": "2026-10-07T00:00:00Z",
        "limit": "2026-06-30T00:00:00Z",
        "series": [
            {
                "type": "upload",
                "sum": 300,
                "values": [
                    {"time": "2026-10-01T00:00:00Z", "value": 100},
                    {"time": "2026-10-02T00:00:00Z", "value": 200},
                ],
            },
            {
                "type": "download",
                "sum": 900,
                "values": [
                    {"time": "2026-10-01T00:00:00Z", "value": 400},
                    {"time": "2026-10-02T00:00:00Z", "value": 500},
                ],
            },
        ],
    }

    async def test_network_data_usage_parses_series(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_data_usage = AsyncMock(
            return_value=make_raw_response(self._SERIES_PAYLOAD)
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["download_bytes"] == 900
        assert data["upload_bytes"] == 300
        assert data["values"] == [
            {
                "time": "2026-10-01T00:00:00Z",
                "upload": 100,
                "download": 400,
            },
            {
                "time": "2026-10-02T00:00:00Z",
                "upload": 200,
                "download": 500,
            },
        ]

    async def test_sum_falls_back_to_summing_values(
        self, auth_client, authenticated_client
    ):
        """When ``sum`` is absent, fall back to summing ``values[].value``."""
        payload = {
            "series": [
                {
                    "type": "upload",
                    "values": [
                        {"time": "2026-10-01T00:00:00Z", "value": 10},
                        {"time": "2026-10-02T00:00:00Z", "value": 20},
                    ],
                },
                {
                    "type": "download",
                    "values": [
                        {"time": "2026-10-01T00:00:00Z", "value": 30},
                    ],
                },
            ]
        }
        authenticated_client.get_eero_data_usage = AsyncMock(
            return_value=make_raw_response(payload)
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/eeros/eero-1",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["upload_bytes"] == 30
        assert data["download_bytes"] == 30

    async def test_device_data_usage_parses_series(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_device_data_usage = AsyncMock(
            return_value=make_raw_response(self._SERIES_PAYLOAD)
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/devices/aa:bb:cc:dd:ee:ff",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["download_bytes"] == 900
        assert data["upload_bytes"] == 300

    async def test_profile_data_usage_parses_series(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_profile_data_usage = AsyncMock(
            return_value=make_raw_response(self._SERIES_PAYLOAD)
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage/profiles/profile-1",
            params={"start": START, "end": END, "cadence": "daily"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["download_bytes"] == 900
        assert data["upload_bytes"] == 300
