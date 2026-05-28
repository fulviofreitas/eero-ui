"""Tests for metrics routes."""

from unittest.mock import AsyncMock, patch


class TestSpeedtestHistory:
    """Tests for GET /api/metrics/speedtest/history."""

    async def test_filters_by_network_id_when_provided(self, auth_client):
        """PromQL must include the network_id label selector when filtering.

        Multi-network accounts otherwise see an arbitrary network's series
        because the frontend picks result[0] (see issue #201).
        """
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(
                return_value={"status": "success", "data": {"result": []}}
            ),
        ) as mock_query:
            response = await auth_client.get(
                "/api/metrics/speedtest/history",
                params={
                    "start": "2024-01-01T00:00:00Z",
                    "end": "2024-01-02T00:00:00Z",
                    "step": "5m",
                    "network_id": "net-abc",
                },
            )

        assert response.status_code == 200
        assert mock_query.await_count == 2
        queries = [call.args[0] for call in mock_query.await_args_list]
        assert 'eero_speed_download_mbps{network_id="net-abc"}' in queries
        assert 'eero_speed_upload_mbps{network_id="net-abc"}' in queries

    async def test_omits_selector_when_network_id_missing(self, auth_client):
        """No network_id means no label selector (preserves existing behavior)."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(
                return_value={"status": "success", "data": {"result": []}}
            ),
        ) as mock_query:
            response = await auth_client.get(
                "/api/metrics/speedtest/history",
                params={
                    "start": "2024-01-01T00:00:00Z",
                    "end": "2024-01-02T00:00:00Z",
                    "step": "5m",
                },
            )

        assert response.status_code == 200
        queries = [call.args[0] for call in mock_query.await_args_list]
        assert "eero_speed_download_mbps" in queries
        assert "eero_speed_upload_mbps" in queries
