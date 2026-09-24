"""Tests for insights routes (WP6 deliverable 7): network/device/profile."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroPremiumRequiredException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


START = "2026-07-21T00:00:00Z"
END = "2026-07-22T00:00:00Z"


class TestNetworkInsights:
    """Tests for GET /api/networks/{network_id}/insights."""

    async def test_returns_normalized_series(self, auth_client, authenticated_client):
        authenticated_client.get_insights = AsyncMock(
            return_value=make_raw_response(
                {
                    "series": [
                        {
                            "insight_type": "adblock",
                            "sum": 12.0,
                            "values": [{"time": START, "value": 3.0}],
                        }
                    ]
                }
            )
        )

        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={
                "start": START,
                "end": END,
                "insight_type": "adblock",
                "cadence": "hourly",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["series"][0]["insight_type"] == "adblock"
        assert data["series"][0]["sum"] == 12.0
        assert data["series"][0]["values"] == [{"time": START, "value": 3.0}]
        authenticated_client.get_insights.assert_called_once_with(
            network_id="net-1",
            start=START,
            end=END,
            insight_type="adblock",
            cadence="hourly",
        )

    async def test_cadence_defaults_to_daily(self, auth_client, authenticated_client):
        authenticated_client.get_insights = AsyncMock(
            return_value=make_raw_response({"series": []})
        )

        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={"start": START, "end": END, "insight_type": "blocked"},
        )

        assert response.status_code == 200
        authenticated_client.get_insights.assert_called_once_with(
            network_id="net-1",
            start=START,
            end=END,
            insight_type="blocked",
            cadence="daily",
        )

    async def test_rejects_invalid_insight_type(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={"start": START, "end": END, "insight_type": "bogus"},
        )

        assert response.status_code == 422
        authenticated_client.get_insights.assert_not_called()

    async def test_rejects_invalid_cadence(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={
                "start": START,
                "end": END,
                "insight_type": "adblock",
                "cadence": "weekly",
            },
        )

        assert response.status_code == 422
        authenticated_client.get_insights.assert_not_called()

    async def test_rejects_malformed_timestamp(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={"start": "not-a-date", "end": END, "insight_type": "adblock"},
        )

        assert response.status_code == 400
        authenticated_client.get_insights.assert_not_called()

    async def test_rejects_end_before_start(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={"start": END, "end": START, "insight_type": "adblock"},
        )

        assert response.status_code == 400
        authenticated_client.get_insights.assert_not_called()

    async def test_rejects_range_over_31_days(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-03-01T00:00:00Z",
                "insight_type": "adblock",
            },
        )

        assert response.status_code == 400
        authenticated_client.get_insights.assert_not_called()

    async def test_premium_required_surfaces_as_402(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_insights = AsyncMock(
            side_effect=EeroPremiumRequiredException("insights")
        )

        response = await auth_client.get(
            "/api/networks/net-1/insights",
            params={"start": START, "end": END, "insight_type": "adblock"},
        )

        assert response.status_code == 402
        assert response.json()["type"] == "premium_required"


class TestDeviceInsights:
    """Tests for GET /api/devices/{device_id}/insights."""

    async def test_returns_series(self, auth_client, authenticated_client):
        authenticated_client.get_device_insights = AsyncMock(
            return_value=make_raw_response({"series": []})
        )

        response = await auth_client.get(
            "/api/devices/dev-1/insights",
            params={"start": START, "end": END, "insight_type": "inspected"},
        )

        assert response.status_code == 200
        authenticated_client.get_device_insights.assert_called_once_with(
            "dev-1",
            network_id="network-123",
            start=START,
            end=END,
            cadence="daily",
            insight_type="inspected",
        )


class TestProfileInsights:
    """Tests for GET /api/profiles/{profile_id}/insights."""

    async def test_returns_series(self, auth_client, authenticated_client):
        authenticated_client.get_profile_insights = AsyncMock(
            return_value=make_raw_response({"series": []})
        )

        response = await auth_client.get(
            "/api/profiles/profile-1/insights",
            params={"start": START, "end": END, "insight_type": "blocked"},
        )

        assert response.status_code == 200
        authenticated_client.get_profile_insights.assert_called_once_with(
            "profile-1",
            network_id="network-123",
            start=START,
            end=END,
            cadence="daily",
            insight_type="blocked",
        )
