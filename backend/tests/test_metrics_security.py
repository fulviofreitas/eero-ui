"""Security tests for the metrics layer.

Covers phase-6.0-revamp.md § 2.5 (metrics-layer security defects):

- Every surviving `/api/metrics/*` route requires authentication.
- The four routes deleted in this revamp no longer exist.
- Identifiers that could break out of a PromQL label selector are
  rejected with 400 before any VictoriaMetrics query is issued.
- `/metrics` and unclaimed `/api/*` paths return a clean 404 JSON body,
  never the SPA's index.html.
"""

from unittest.mock import AsyncMock, patch

import pytest


class TestMetricsRequireAuth:
    """Every surviving /api/metrics/* route must reject anonymous callers."""

    @pytest.mark.parametrize(
        "method,path,params",
        [
            ("get", "/api/metrics/health", None),
            (
                "get",
                "/api/metrics/speedtest/history",
                {"start": "0", "end": "100", "step": "1m"},
            ),
            (
                "get",
                "/api/metrics/devices/aabbccddeeff/signal",
                {"start": "0", "end": "100", "step": "1m"},
            ),
            (
                "get",
                "/api/metrics/network/client_count",
                {"start": "0", "end": "100", "step": "1m"},
            ),
        ],
    )
    async def test_route_requires_auth(
        self, async_client, mock_eero_client, method, path, params
    ):
        """Unauthenticated requests to surviving metrics routes get 401."""
        mock_eero_client.is_authenticated = False

        response = await getattr(async_client, method)(path, params=params)

        assert response.status_code == 401


class TestDeletedMetricsRoutesAreGone:
    """The raw-PromQL passthrough and dead routes no longer exist."""

    @pytest.mark.parametrize(
        "method,path,params",
        [
            ("get", "/api/metrics/query", {"query": "up"}),
            (
                "get",
                "/api/metrics/query_range",
                {"query": "up", "start": "0", "end": "100"},
            ),
            (
                "get",
                "/api/metrics/devices/aabbccddeeff/bandwidth",
                {"start": "0", "end": "100"},
            ),
            (
                "get",
                "/api/metrics/eeros/serial123/quality",
                {"start": "0", "end": "100"},
            ),
        ],
    )
    async def test_deleted_route_returns_404(
        self, async_client, mock_eero_client, method, path, params
    ):
        """Deleted routes return 404 regardless of auth state."""
        response = await getattr(async_client, method)(path, params=params)

        assert response.status_code == 404


class TestIdentifierValidation:
    """Identifiers must be validated before reaching a PromQL selector."""

    MALICIOUS_VALUES = [
        '"',
        "}",
        "\n",
        "..",
        "a/b",
        "abc\n",  # trailing newline after a valid-looking prefix (regex "$" bug)
    ]

    @pytest.mark.parametrize("bad_value", MALICIOUS_VALUES)
    async def test_network_id_rejected_before_query(
        self, auth_client, authenticated_client, bad_value
    ):
        """A malformed network_id is rejected with 400, no query issued."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/speedtest/history",
                params={
                    "start": "0",
                    "end": "100",
                    "step": "1m",
                    "network_id": bad_value,
                },
            )

            assert response.status_code == 400
            mocked_query_range.assert_not_called()

    @pytest.mark.parametrize("bad_value", ['"', "}", "\n"])
    async def test_device_id_rejected_before_query(
        self, auth_client, authenticated_client, bad_value
    ):
        """A malformed device_id is rejected with 400, no query issued.

        Note: ".." is exercised via network_id (query parameter) instead of
        here, because URL clients collapse "../" path segments before the
        request ever reaches the server -- there is no way to observe the
        server-side validator via a path-segment ".." in an HTTP client.
        """
        from urllib.parse import quote

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                f"/api/metrics/devices/{quote(bad_value, safe='')}/signal",
                params={"start": "0", "end": "100", "step": "1m"},
            )

            assert response.status_code == 400
            mocked_query_range.assert_not_called()

    async def test_valid_network_id_reaches_query(
        self, auth_client, authenticated_client
    ):
        """A well-formed network_id is accepted and the query is issued."""
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "success", "data": {}}),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/speedtest/history",
                params={
                    "start": "0",
                    "end": "100",
                    "step": "1m",
                    "network_id": "network-123",
                },
            )

            assert response.status_code == 200
            mocked_query_range.assert_called()

    async def test_network_id_with_raw_percent_0a_rejected_before_query(
        self, auth_client, authenticated_client
    ):
        """A raw "%0A"-encoded trailing newline in the query string is
        rejected with 400, not just the equivalent Python "\\n" literal.

        This exercises the URL-decoding path directly rather than relying
        on httpx to percent-encode a "\\n" passed via ``params``.
        """
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/speedtest/history"
                "?start=0&end=100&step=1m&network_id=abc%0A"
            )

            assert response.status_code == 400
            mocked_query_range.assert_not_called()


class TestNoIndexHtmlLeak:
    """`/metrics` and unclaimed `/api/*` paths must never fall through to the SPA."""

    async def test_metrics_path_returns_404_json(self, async_client):
        """`/metrics` has no replacement endpoint and must 404."""
        response = await async_client.get("/metrics")

        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")

    async def test_unclaimed_api_path_returns_404_json(self, async_client):
        """An unclaimed `/api/*` path must 404, not serve index.html."""
        response = await async_client.get("/api/does-not-exist")

        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")


class TestMetricsHealthReportsCollectorState:
    """/api/metrics/health surfaces the collector's own self-observability.

    See phase-6.0-revamp.md § 2.3: a stalled collector should be visible
    here (last_successful_write not advancing, collector_errors_total
    climbing) even if every metric series still looks fine.
    """

    async def test_health_includes_last_successful_write_and_error_counts(
        self, auth_client
    ):
        """The health payload includes both new fields, sourced from the collector."""
        from app.main import app
        from app.services.collector import MetricsCollector
        from app.services.victoria import victoria_client

        async def get_eero_client():
            yield None

        collector = MetricsCollector(
            get_eero_client, victoria_client, interval_seconds=60
        )
        collector._error_counts["api"] = 3
        app.state.metrics_collector = collector

        with patch(
            "app.routes.metrics.victoria_client.health",
            new=AsyncMock(return_value=True),
        ):
            response = await auth_client.get("/api/metrics/health")

        assert response.status_code == 200
        data = response.json()
        assert "last_successful_write" in data
        assert data["collector_errors_total"]["api"] == 3

    async def test_health_tolerates_missing_collector(self, auth_client):
        """If app.state has no collector yet (e.g. mid-startup), health still responds."""
        from app.main import app

        if hasattr(app.state, "metrics_collector"):
            del app.state.metrics_collector

        with patch(
            "app.routes.metrics.victoria_client.health",
            new=AsyncMock(return_value=True),
        ):
            response = await auth_client.get("/api/metrics/health")

        assert response.status_code == 200
        data = response.json()
        assert data["collector_errors_total"] == {}
