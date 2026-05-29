"""Tests for metrics routes."""

from unittest.mock import AsyncMock, patch


def _empty_range_result() -> dict:
    return {"status": "success", "data": {"resultType": "matrix", "result": []}}


class TestSpeedtestHistory:
    """Tests for GET /api/metrics/speedtest/history."""

    async def test_omits_label_selector_when_network_id_missing(self, async_client):
        """Without ``network_id`` the PromQL is unfiltered (backwards compatible)."""
        mock_query = AsyncMock(return_value=_empty_range_result())

        with patch(
            "app.routes.metrics.victoria_client.query_range", mock_query
        ):
            response = await async_client.get(
                "/api/metrics/speedtest/history",
                params={"start": "0", "end": "1", "step": "5m"},
            )

        assert response.status_code == 200
        assert mock_query.await_count == 2
        queried = [call.args[0] for call in mock_query.await_args_list]
        assert "eero_speed_download_mbps" in queried
        assert "eero_speed_upload_mbps" in queried
        # No label selector when no network filter is requested.
        assert all("network_id" not in q for q in queried)

    async def test_filters_by_network_id_when_provided(self, async_client):
        """When ``network_id`` is set the label selector is added to both queries.

        This is the fix for the dashboard speedtest chart displaying values
        from an arbitrary network in multi-network accounts.
        """
        mock_query = AsyncMock(return_value=_empty_range_result())

        with patch(
            "app.routes.metrics.victoria_client.query_range", mock_query
        ):
            response = await async_client.get(
                "/api/metrics/speedtest/history",
                params={
                    "start": "0",
                    "end": "1",
                    "step": "5m",
                    "network_id": "net-abc",
                },
            )

        assert response.status_code == 200
        queried = [call.args[0] for call in mock_query.await_args_list]
        assert 'eero_speed_download_mbps{network_id="net-abc"}' in queried
        assert 'eero_speed_upload_mbps{network_id="net-abc"}' in queried

    async def test_escapes_quotes_in_network_id(self, async_client):
        """A network_id containing quotes is escaped so it cannot break the selector."""
        mock_query = AsyncMock(return_value=_empty_range_result())

        with patch(
            "app.routes.metrics.victoria_client.query_range", mock_query
        ):
            response = await async_client.get(
                "/api/metrics/speedtest/history",
                params={
                    "start": "0",
                    "end": "1",
                    "step": "5m",
                    "network_id": 'a"b',
                },
            )

        assert response.status_code == 200
        queried = [call.args[0] for call in mock_query.await_args_list]
        assert 'eero_speed_download_mbps{network_id="a\\"b"}' in queried
