"""Tests for the VictoriaMetrics client's write path.

Live behaviour of the pinned v1.96.0 binary was verified manually per
phase-6.0-revamp.md § 10 R2b before this module was written; these tests
pin the *client's* contract (one shared connection, NDJSON body shape,
typed failure) rather than re-verifying VictoriaMetrics itself.
"""

import json

import httpx
import pytest

from app.services.victoria import Sample, VictoriaMetricsClient, VictoriaWriteError


def _client_with_transport(handler) -> VictoriaMetricsClient:
    """Build a VictoriaMetricsClient whose shared httpx client uses a mock transport."""
    client = VictoriaMetricsClient(base_url="http://vm.test")
    # Force-create the shared client now, wired to the mock transport, so
    # every call in the test goes through `handler` instead of the network.
    client._client = httpx.AsyncClient(
        base_url=client.base_url, transport=httpx.MockTransport(handler)
    )
    return client


class TestWrite:
    """Tests for VictoriaMetricsClient.write()."""

    async def test_write_posts_ndjson_to_import_endpoint(self):
        """write() POSTs one NDJSON line per sample to /api/v1/import."""
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["body"] = request.content.decode("utf-8")
            captured["content_type"] = request.headers.get("content-type")
            return httpx.Response(204)

        client = _client_with_transport(handler)
        samples = [
            Sample("eero_up", 1.0, 1758547200000),
            Sample(
                "eero_device_connected",
                1.0,
                1758547200000,
                labels={"network_id": "n1", "device_id": "d1"},
            ),
        ]

        await client.write(samples)

        assert captured["url"] == "http://vm.test/api/v1/import"
        assert "application/x-ndjson" in captured["content_type"]
        lines = captured["body"].splitlines()
        assert len(lines) == 2
        first = json.loads(lines[0])
        assert first == {
            "metric": {"__name__": "eero_up"},
            "values": [1.0],
            "timestamps": [1758547200000],
        }
        second = json.loads(lines[1])
        assert second["metric"]["__name__"] == "eero_device_connected"
        assert second["metric"]["network_id"] == "n1"
        assert second["metric"]["device_id"] == "d1"

    async def test_write_is_noop_for_empty_samples(self):
        """write() with an empty list makes no HTTP request at all."""
        calls = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(204)

        client = _client_with_transport(handler)
        await client.write([])

        assert calls == []

    async def test_write_reuses_one_shared_client_across_calls(self):
        """Two write() calls reuse the same underlying httpx.AsyncClient."""
        calls = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(204)

        client = _client_with_transport(handler)
        underlying_client = client._client

        await client.write([Sample("eero_up", 1.0, 1000)])
        await client.write([Sample("eero_up", 1.0, 2000)])

        assert client._client is underlying_client
        assert len(calls) == 2

    async def test_write_sets_last_successful_write_on_success(self):
        """A successful write records last_successful_write."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(204)

        client = _client_with_transport(handler)
        assert client.last_successful_write is None

        await client.write([Sample("eero_up", 1.0, 1000)])

        assert client.last_successful_write is not None

    async def test_write_raises_typed_error_on_http_failure(self):
        """A non-2xx response surfaces as VictoriaWriteError, not the raw httpx error."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="internal error")

        client = _client_with_transport(handler)

        with pytest.raises(VictoriaWriteError):
            await client.write([Sample("eero_up", 1.0, 1000)])

        # A failed write must not update last_successful_write.
        assert client.last_successful_write is None

    async def test_write_raises_typed_error_on_transport_failure(self):
        """A transport-level failure (e.g. connection refused) also becomes VictoriaWriteError."""

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        client = _client_with_transport(handler)

        with pytest.raises(VictoriaWriteError):
            await client.write([Sample("eero_up", 1.0, 1000)])

    async def test_write_survives_label_values_with_quotes_braces_and_newlines(self):
        """A label value with a quote, brace, backslash and newline round-trips through JSON.

        Verified live against VictoriaMetrics v1.96.0 in phase-6.0-revamp.md
        § 10 R2b; this test pins that the client builds that exact JSON
        shape rather than re-verifying the server.
        """
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = request.content.decode("utf-8")
            return httpx.Response(204)

        client = _client_with_transport(handler)
        tricky = 'weird"name}with\\backslash\nand newline'
        await client.write(
            [
                Sample(
                    "eero_test_tricky_label", 42.0, 1000, labels={"weird_label": tricky}
                )
            ]
        )

        line = json.loads(captured["body"])
        assert line["metric"]["weird_label"] == tricky


class TestQueryAndQueryRange:
    """Tests that reading methods still work against the shared client."""

    async def test_query_reuses_shared_client(self):
        """query() uses the shared client, not a per-call client."""

        def handler(request: httpx.Request) -> httpx.Response:
            assert str(request.url).startswith("http://vm.test/api/v1/query")
            return httpx.Response(200, json={"status": "success", "data": {}})

        client = _client_with_transport(handler)
        underlying_client = client._client

        result = await client.query("eero_up")

        assert result == {"status": "success", "data": {}}
        assert client._client is underlying_client

    async def test_query_range_reuses_shared_client(self):
        """query_range() uses the shared client, not a per-call client."""

        def handler(request: httpx.Request) -> httpx.Response:
            assert "/api/v1/query_range" in str(request.url)
            return httpx.Response(200, json={"status": "success", "data": {}})

        client = _client_with_transport(handler)
        await client.query_range("eero_up", "0", "100", "1m")


class TestHealth:
    """Tests for VictoriaMetricsClient.health()."""

    async def test_health_true_on_200(self):
        """health() returns True on HTTP 200."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, text="OK")

        client = _client_with_transport(handler)
        assert await client.health() is True

    async def test_health_false_on_request_error(self):
        """health() returns False (not an exception) on a transport error."""

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        client = _client_with_transport(handler)
        assert await client.health() is False


class TestAclose:
    """Tests for VictoriaMetricsClient.aclose()."""

    async def test_aclose_releases_the_shared_client(self):
        """aclose() drops the shared client so a later call creates a fresh one."""

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(204)

        client = _client_with_transport(handler)
        underlying_client = client._client

        await client.aclose()

        assert client._client is None
        assert underlying_client.is_closed

    async def test_aclose_is_a_noop_when_never_used(self):
        """aclose() on a client that never made a request does not raise."""
        client = VictoriaMetricsClient(base_url="http://vm.test")
        await client.aclose()
