"""Tests for GET /api/metrics/network/client_count (eero-ui#413).

Covers the fix for two maintainer-reported discrepancies:

- `total` and the wireless/wired split are now derived from the same
  `eero_device_connected` series, so `total >= wireless + wired` always
  holds by construction (previously `total` came from the unrelated
  `eero_network_clients_count` gauge).
- The route now accepts an optional `network_id` to scope every query,
  matching the pattern already used by `/metrics/speedtest/history`.
"""

from unittest.mock import AsyncMock, patch

import pytest


class TestNetworkClientCountQueries:
    """The PromQL issued by /metrics/network/client_count."""

    async def test_all_three_queries_use_eero_device_connected(
        self, auth_client, authenticated_client
    ):
        """total/wireless/wired must all read from eero_device_connected,
        never from the unrelated eero_network_clients_count gauge, so
        total can never fall below wireless + wired."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "success", "data": {}}),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/network/client_count",
                params={"start": "0", "end": "100", "step": "5m"},
            )

            assert response.status_code == 200
            queries = [call.args[0] for call in mocked_query_range.call_args_list]

        assert len(queries) == 3
        for query in queries:
            assert "eero_device_connected" in query
            assert "eero_network_clients_count" not in query

        wireless_queries = [q for q in queries if 'connection_type="wireless"' in q]
        wired_queries = [q for q in queries if 'connection_type="wired"' in q]
        total_queries = [q for q in queries if "connection_type" not in q]
        assert len(wireless_queries) == 1
        assert len(wired_queries) == 1
        assert len(total_queries) == 1

    async def test_network_id_scopes_every_query(
        self, auth_client, authenticated_client
    ):
        """Passing network_id adds a network_id label selector to all three
        queries (total, wireless, wired), matching /speedtest/history."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "success", "data": {}}),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/network/client_count",
                params={
                    "start": "0",
                    "end": "100",
                    "step": "5m",
                    "network_id": "network-123",
                },
            )

            assert response.status_code == 200
            queries = [call.args[0] for call in mocked_query_range.call_args_list]

        for query in queries:
            assert 'network_id="network-123"' in query

    async def test_no_network_id_omits_network_label(
        self, auth_client, authenticated_client
    ):
        """Without network_id, queries aggregate across every network."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "success", "data": {}}),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/network/client_count",
                params={"start": "0", "end": "100", "step": "5m"},
            )

            assert response.status_code == 200
            queries = [call.args[0] for call in mocked_query_range.call_args_list]

        for query in queries:
            assert "network_id" not in query

    @pytest.mark.parametrize("bad_value", ['"', "}", "\n", ".."])
    async def test_malformed_network_id_rejected_before_query(
        self, auth_client, authenticated_client, bad_value
    ):
        """A malformed network_id is rejected with 400, no query issued."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/network/client_count",
                params={
                    "start": "0",
                    "end": "100",
                    "step": "5m",
                    "network_id": bad_value,
                },
            )

            assert response.status_code == 400
            mocked_query_range.assert_not_called()

    async def test_response_shape_preserves_backwards_compatible_client_count(
        self, auth_client, authenticated_client
    ):
        """The response still carries the deprecated `client_count` alias
        for `total`, unchanged by this fix."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "success", "data": {}}),
        ):
            response = await auth_client.get(
                "/api/metrics/network/client_count",
                params={"start": "0", "end": "100", "step": "5m"},
            )

        body = response.json()
        assert body["client_count"] == body["total"]
        assert set(body.keys()) == {"total", "wireless", "wired", "client_count"}
