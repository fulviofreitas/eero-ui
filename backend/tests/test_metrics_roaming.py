"""Tests for GET /api/metrics/roaming (eero-ui#431 WP2).

Covers PromQL construction, the two caps (MAX_EVENTS/MAX_SERIES), name
resolution (current device/eero records -> VictoriaMetrics labels ->
device_id), identifier/range validation, and VictoriaMetrics failure
handling.
"""

from unittest.mock import AsyncMock, patch

import pytest

NETWORK_ID = "net-1"
FIXED_NOW = 1_700_100_000
DEFAULT_RANGE_SECONDS = 86400  # "24h"
DEFAULT_STEP = 60  # max(collection_interval=60, ceil(86400/2880)=30)


def make_raw_response(data):
    """Build a raw API response envelope, matching eero-api's shape."""
    return {"meta": {"code": 200}, "data": data}


def make_vm_response(result):
    """Build a VictoriaMetrics query_range success envelope."""
    return {"status": "success", "data": {"result": result}}


def make_series(device_id, source_eero, timestamp, value=1, name=None, mac=None):
    """Build one ``eero_device_connected`` matrix series with one sample."""
    metric = {
        "__name__": "eero_device_connected",
        "device_id": device_id,
        "source_eero": source_eero,
        "network_id": NETWORK_ID,
    }
    if name is not None:
        metric["name"] = name
    if mac is not None:
        metric["mac"] = mac
    return {"metric": metric, "values": [[timestamp, str(value)]]}


def make_device(dev_id="dev-1", nickname="My Phone", mac="aa:bb:cc:dd:ee:ff"):
    """Build a minimal raw device dict (eero-api shape)."""
    return {
        "url": f"/2.2/networks/{NETWORK_ID}/devices/{dev_id}",
        "nickname": nickname,
        "mac": mac,
    }


def make_eero(eero_id="eero-bedroom", location="Bedroom"):
    """Build a minimal raw eero dict (eero-api shape)."""
    return {
        "url": f"/2.2/networks/{NETWORK_ID}/eeros/{eero_id}",
        "location": location,
    }


@pytest.fixture(autouse=True)
def _fixed_now():
    """Deterministic ``end``/``start`` window for every test in this module."""
    with patch("app.routes.metrics._now", return_value=FIXED_NOW):
        yield


class TestHappyPathAndPromQL:
    """The exact PromQL issued and full name resolution on a successful call."""

    async def test_move_event_with_full_name_resolution(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device()])
        )
        authenticated_client.get_eeros = AsyncMock(
            return_value=make_raw_response([make_eero()])
        )
        result = [
            make_series("dev-1", "Living Room", 1000, name="Old Name"),
            make_series("dev-1", "Bedroom", 2000, name="Old Name"),
        ]

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response(result)),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 200
        (promql, start, end, step), _kwargs = mocked_query_range.call_args
        assert promql == (
            f'last_over_time(eero_device_connected{{network_id="{NETWORK_ID}"}}'
            f"[{DEFAULT_STEP}s])"
        )
        assert end == str(FIXED_NOW)
        assert start == str(FIXED_NOW - DEFAULT_RANGE_SECONDS)
        assert step == f"{DEFAULT_STEP}s"

        body = response.json()
        assert body["network_id"] == NETWORK_ID
        assert body["range"] == "24h"
        assert body["resolution_seconds"] == DEFAULT_STEP
        assert body["total_events"] == 1
        assert body["truncated"] is False
        assert len(body["events"]) == 1

        event = body["events"][0]
        assert event["event_type"] == "move"
        assert event["device_id"] == "dev-1"
        # Current device record wins over the VM "name" label.
        assert event["device_name"] == "My Phone"
        assert event["mac"] == "aa:bb:cc:dd:ee:ff"
        assert event["timestamp"] == "1970-01-01T00:33:20Z"
        assert event["previous_seen"] == "1970-01-01T00:16:40Z"
        # "Living Room" has no current eero -> eero_id None, name is the label.
        assert event["from_node"] == {"name": "Living Room", "eero_id": None}
        # "Bedroom" matches the current eero's location -> resolved eero_id.
        assert event["to_node"] == {"name": "Bedroom", "eero_id": "eero-bedroom"}

        assert len(body["top_roamers"]) == 1
        assert body["top_roamers"][0] == {
            "device_id": "dev-1",
            "device_name": "My Phone",
            "moves": 1,
        }

        assert set(body.keys()) == {
            "network_id",
            "range",
            "start",
            "end",
            "resolution_seconds",
            "total_events",
            "truncated",
            "events",
            "top_roamers",
        }
        assert set(event.keys()) == {
            "timestamp",
            "previous_seen",
            "device_id",
            "device_name",
            "mac",
            "event_type",
            "from_node",
            "to_node",
        }

    async def test_device_id_filter_appears_in_selector(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response([])),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/roaming",
                params={"network_id": NETWORK_ID, "device_id": "dev-1"},
            )

        assert response.status_code == 200
        promql = mocked_query_range.call_args.args[0]
        assert f'network_id="{NETWORK_ID}"' in promql
        assert 'device_id="dev-1"' in promql

    async def test_empty_result_returns_empty_lists(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response([])),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 200
        body = response.json()
        assert body["events"] == []
        assert body["top_roamers"] == []
        assert body["total_events"] == 0
        assert body["truncated"] is False

    async def test_single_sample_device_produces_no_events(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))
        result = [make_series("dev-1", "Living Room", 1000)]

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response(result)),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 200
        body = response.json()
        assert body["events"] == []
        assert body["top_roamers"] == []


class TestNodeResolution:
    """Node name/eero_id resolution edge cases."""

    async def test_empty_node_label_resolves_to_unknown_node(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))
        # offline (value 0, no node) -> reconnect to an empty source_eero label.
        result = [
            make_series("dev-1", "", 1000, value=0),
            make_series("dev-1", "", 2000, value=1),
        ]

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response(result)),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 200
        event = response.json()["events"][0]
        assert event["event_type"] == "reconnect"
        assert event["from_node"] is None
        assert event["to_node"] == {"name": "Unknown node", "eero_id": None}


class TestNameResolutionFallback:
    """Name/mac resolution falls back to VM labels when the SDK fails."""

    async def test_sdk_failure_falls_back_to_vm_labels(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(side_effect=RuntimeError("boom"))
        authenticated_client.get_eeros = AsyncMock(
            return_value=make_raw_response([make_eero()])
        )
        result = [
            make_series("dev-1", "Living Room", 1000, name="Label Name", mac="aa:bb"),
            make_series("dev-1", "Bedroom", 2000, name="Label Name", mac="aa:bb"),
        ]

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response(result)),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 200
        event = response.json()["events"][0]
        assert event["device_name"] == "Label Name"
        assert event["mac"] == "aa:bb"
        # Even though get_eeros succeeded, get_devices failing discards both
        # (best-effort, all-or-nothing) -- node resolution also falls back.
        assert event["to_node"] == {"name": "Bedroom", "eero_id": None}


class TestCaps:
    """MAX_EVENTS truncation and the MAX_SERIES 422."""

    async def test_more_than_max_events_truncates_and_reports_total(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        # 502 one-sample series alternating node A/B -> 501 "move" transitions.
        result = [
            make_series("dev-1", "A" if i % 2 == 0 else "B", 1000 + i * 60)
            for i in range(502)
        ]

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response(result)),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 200
        body = response.json()
        assert body["total_events"] == 501
        assert body["truncated"] is True
        assert len(body["events"]) == 500
        assert body["top_roamers"] == [
            {"device_id": "dev-1", "device_name": "dev-1", "moves": 501}
        ]

    async def test_more_than_max_series_is_rejected(
        self, auth_client, authenticated_client
    ):
        result = [make_series(f"dev-{i}", "A", 1000) for i in range(2001)]

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value=make_vm_response(result)),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 422
        assert "narrow the range" in response.json()["detail"]


class TestValidation:
    """Identifier and range validation, all rejected before query_range."""

    @pytest.mark.parametrize("bad_value", ['abc"}', "abc\n"])
    async def test_invalid_network_id_rejected(
        self, auth_client, authenticated_client, bad_value
    ):
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": bad_value}
            )

        assert response.status_code == 400
        mocked_query_range.assert_not_called()

    @pytest.mark.parametrize("bad_value", ['abc"}', "abc\n"])
    async def test_invalid_device_id_rejected(
        self, auth_client, authenticated_client, bad_value
    ):
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/roaming",
                params={"network_id": NETWORK_ID, "device_id": bad_value},
            )

        assert response.status_code == 400
        mocked_query_range.assert_not_called()

    async def test_invalid_range_rejected(self, auth_client, authenticated_client):
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(),
        ) as mocked_query_range:
            response = await auth_client.get(
                "/api/metrics/roaming",
                params={"network_id": NETWORK_ID, "range": "2d"},
            )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid range"
        mocked_query_range.assert_not_called()


class TestVictoriaMetricsFailures:
    """VictoriaMetrics transport/shape failures map to 503."""

    async def test_httpx_error_returns_503(self, auth_client, authenticated_client):
        import httpx

        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(side_effect=httpx.ConnectError("refused")),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 503

    async def test_non_success_status_returns_503(
        self, auth_client, authenticated_client
    ):
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "error", "data": {}}),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 503

    async def test_malformed_body_returns_503(self, auth_client, authenticated_client):
        with patch(
            "app.routes.metrics.victoria_client.query_range",
            new=AsyncMock(return_value={"status": "success", "data": {}}),
        ):
            response = await auth_client.get(
                "/api/metrics/roaming", params={"network_id": NETWORK_ID}
            )

        assert response.status_code == 503


class TestAuth:
    """Anonymous callers are rejected."""

    async def test_requires_auth(self, async_client, mock_eero_client):
        mock_eero_client.is_authenticated = False

        response = await async_client.get(
            "/api/metrics/roaming", params={"network_id": NETWORK_ID}
        )

        assert response.status_code == 401
