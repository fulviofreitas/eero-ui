"""Tests for the metrics collector.

Covers phase-6.0-revamp.md § 2.3 (the metric contract) and § 8.1 (the
required test scenarios): every named metric with its exact label-key set,
NDJSON-with-ms-timestamps payload shape, the unauthenticated cycle, partial
failure, write failure, the tricky-label round trip, and the offline vs.
absent device rules.
"""

import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, create_autospec

import pytest
from eero.exceptions import (
    EeroAPIException,
    EeroAuthenticationException,
    EeroNetworkException,
    EeroRateLimitException,
)

from app.routes import metrics as metrics_route
from app.services import collector as collector_module
from app.services.collector import MetricsCollector
from app.services.victoria import Sample, VictoriaMetricsClient, VictoriaWriteError
from app.services.wan import EXPIRY_SECONDS, SETTLE_SECONDS, WanTracker


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


def _read_metrics_route_source() -> str:
    """Read routes/metrics.py source text.

    A plain sync helper (never called from inside an ``async def``) so the
    blocking file read never runs on the event loop -- see ASYNC230.
    """
    with open(metrics_route.__file__, encoding="utf-8") as f:
        return f.read()


def make_network(net_id="net-1", name="Home", last_reboot=None, mode=None):
    """Build a minimal raw network dict."""
    net: dict = {"url": f"/2.2/networks/{net_id}", "name": name}
    if mode is not None:
        net["connection"] = {"mode": mode}
    if last_reboot is not None:
        net["last_reboot"] = last_reboot
    return net


def make_device(
    dev_id="dev-1",
    mac="aa:bb:cc:dd:ee:ff",
    name="My Phone",
    manufacturer="Acme",
    device_type="phone",
    connected=True,
    wireless=True,
    signal=None,
    score_bars=None,
    source_location="Living Room",
    usage=None,
):
    """Build a minimal raw device dict matching the eero API's shape."""
    device = {
        "url": f"/2.2/networks/net-1/devices/{dev_id}",
        "mac": mac,
        "nickname": name,
        "manufacturer": manufacturer,
        "device_type": device_type,
        "connected": connected,
        "wireless": wireless,
        "connectivity": {
            "signal": f"{signal} dBm" if signal is not None else None,
            "score_bars": score_bars,
        },
        "source": {
            "location": source_location,
            "url": "/2.2/networks/net-1/eeros/eero-1",
        },
    }
    if usage is not None:
        device["usage"] = {"down_mbps": usage[0], "up_mbps": usage[1]}
    return device


def make_eero(
    eero_id="eero-1",
    location="Living Room",
    model="eero Pro 6",
    mesh_quality_bars=5,
    connected_clients_count=3,
    last_reboot=None,
):
    """Build a minimal raw eero dict."""
    eero: dict = {
        "url": f"/2.2/networks/net-1/eeros/{eero_id}",
        "location": location,
        "model": model,
        "mesh_quality_bars": mesh_quality_bars,
        "connected_clients_count": connected_clients_count,
    }
    if last_reboot is not None:
        eero["last_reboot"] = last_reboot
    return eero


@pytest.fixture
def autospec_client(_clone_eero_client):
    """A create_autospec(EeroClient, instance=True) mock, authenticated by default.

    Using autospec means a renamed or removed SDK method fails the test at
    call time instead of silently returning a non-awaitable MagicMock.

    Built via ``_clone_eero_client`` (conftest.py), a lazy per-attribute
    clone of the session-scoped template -- eagerly deepcopy-ing the whole
    ~200-method template here cost ~0.13s per test regardless of the
    handful of methods this fixture actually sets (backend
    test-performance investigation, 2026-09-24).
    """
    client = _clone_eero_client()
    client.is_authenticated = True
    client.get_networks = AsyncMock(return_value=make_raw_response([make_network()]))
    client.get_devices = AsyncMock(return_value=make_raw_response([]))
    client.get_eeros = AsyncMock(return_value=make_raw_response([]))
    client.get_speed_tests = AsyncMock(return_value=make_raw_response([]))
    client.get_dns_settings = AsyncMock(
        return_value=make_raw_response({"dns": {"mode": "automatic"}})
    )
    return client


@pytest.fixture
def fake_victoria():
    """A VictoriaMetricsClient stand-in that records write() calls instead of sending them."""
    victoria = create_autospec(VictoriaMetricsClient, instance=True)
    victoria.written_batches: list[list[Sample]] = []

    async def _write(samples):
        victoria.written_batches.append(samples)

    victoria.write = AsyncMock(side_effect=_write)
    return victoria


def make_collector(client, victoria) -> MetricsCollector:
    """Build a collector whose get_eero_client dependency yields `client` once."""

    async def get_eero_client():
        yield client

    return MetricsCollector(get_eero_client, victoria, interval_seconds=10)


def samples_by_name(samples: list[Sample], name: str) -> list[Sample]:
    """Filter a sample list down to one metric name."""
    return [s for s in samples if s.name == name]


class TestUnauthenticatedCycle:
    """An unauthenticated client must not touch the eero API at all."""

    async def test_writes_eero_up_zero_without_calling_the_api(
        self, autospec_client, fake_victoria
    ):
        autospec_client.is_authenticated = False
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        autospec_client.get_networks.assert_not_called()
        written = fake_victoria.written_batches[0]
        up = samples_by_name(written, "eero_up")
        assert len(up) == 1
        assert up[0].value == 0.0

    async def test_still_writes_self_metrics(self, autospec_client, fake_victoria):
        autospec_client.is_authenticated = False
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        assert samples_by_name(written, "eero_collector_cycle_seconds")
        errors = samples_by_name(written, "eero_collector_errors_total")
        assert {s.labels["reason"] for s in errors} == {
            "auth",
            "api",
            "network",
            "rate_limit",
            "write",
            "unknown",
        }

    async def test_does_not_raise(self, autospec_client, fake_victoria):
        autospec_client.is_authenticated = False
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()  # must not raise


class TestSuccessfulCycle:
    """A fully successful cycle emits every § 2.3 metric with its exact label set."""

    async def test_eero_up_is_one(self, autospec_client, fake_victoria):
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        up = samples_by_name(written, "eero_up")
        assert up[0].value == 1.0

    async def test_network_clients_count_labels(self, autospec_client, fake_victoria):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response(
                [
                    make_device(dev_id="d1", connected=True),
                    make_device(dev_id="d2", connected=False),
                ]
            )
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        count = samples_by_name(written, "eero_network_clients_count")
        assert len(count) == 1
        assert set(count[0].labels) == {"network_id", "name"}
        assert count[0].value == 1.0  # only d1 is connected

    async def test_device_connected_exact_label_set(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device()])
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        connected = samples_by_name(written, "eero_device_connected")
        assert len(connected) == 1
        assert set(connected[0].labels) == {
            "network_id",
            "device_id",
            "name",
            "mac",
            "manufacturer",
            "device_type",
            "connection_type",
            "source_eero",
        }
        assert connected[0].value == 1.0

    async def test_device_signal_strength_exact_label_set(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device(signal=-55)])
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        signal = samples_by_name(written, "eero_device_signal_strength_dbm")
        assert len(signal) == 1
        assert set(signal[0].labels) == {
            "network_id",
            "device_id",
            "name",
            "manufacturer",
            "band",
            "source_eero",
        }
        assert signal[0].value == -55.0

    async def test_device_connection_score_bars_exact_label_set(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device(score_bars=4)])
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        bars = samples_by_name(written, "eero_device_connection_score_bars")
        assert len(bars) == 1
        assert set(bars[0].labels) == {
            "network_id",
            "device_id",
            "name",
            "manufacturer",
            "connection_type",
            "source_eero",
        }
        assert bars[0].value == 4.0

    async def test_eero_mesh_quality_bars_exact_label_set(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_eeros = AsyncMock(
            return_value=make_raw_response([make_eero()])
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        quality = samples_by_name(written, "eero_eero_mesh_quality_bars")
        assert len(quality) == 1
        assert set(quality[0].labels) == {"network_id", "eero_id", "location", "model"}
        assert quality[0].value == 5.0

    async def test_speed_test_metrics(self, autospec_client, fake_victoria):
        autospec_client.get_speed_tests = AsyncMock(
            return_value=make_raw_response(
                [
                    {
                        "down": {"value": 250.5},
                        "up": {"value": 20.1},
                        "date": "2026-01-01T00:00:00Z",
                    }
                ]
            )
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        download = samples_by_name(written, "eero_speed_download_mbps")
        upload = samples_by_name(written, "eero_speed_upload_mbps")
        assert download[0].value == 250.5
        assert set(download[0].labels) == {"network_id"}
        assert upload[0].value == 20.1
        assert set(upload[0].labels) == {"network_id"}

    async def test_added_metrics_present_with_exact_labels(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_eeros = AsyncMock(
            return_value=make_raw_response(
                [make_eero(last_reboot="2026-05-01T08:30:00.000Z")]
            )
        )
        autospec_client.get_networks = AsyncMock(
            return_value=make_raw_response(
                [make_network(last_reboot="2026-05-01T08:00:00.000Z")]
            )
        )
        autospec_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response({"dns": {"mode": "custom"}})
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]

        net_reboot = samples_by_name(
            written, "eero_network_last_reboot_timestamp_seconds"
        )
        assert len(net_reboot) == 1
        assert set(net_reboot[0].labels) == {"network_id"}

        eero_reboot = samples_by_name(
            written, "eero_eero_last_reboot_timestamp_seconds"
        )
        assert len(eero_reboot) == 1
        assert set(eero_reboot[0].labels) == {"network_id", "eero_id"}

        dns_mode = samples_by_name(written, "eero_network_dns_mode")
        assert len(dns_mode) == 1
        assert set(dns_mode[0].labels) == {"network_id", "mode"}
        assert dns_mode[0].labels["mode"] == "custom"
        assert dns_mode[0].value == 1.0

        client_count = samples_by_name(written, "eero_eero_client_count")
        assert len(client_count) == 1
        assert set(client_count[0].labels) == {"network_id", "eero_id", "location"}

    async def test_cycle_seconds_and_errors_total_present_every_cycle(
        self, autospec_client, fake_victoria
    ):
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        cycle_seconds = samples_by_name(written, "eero_collector_cycle_seconds")
        assert len(cycle_seconds) == 1
        assert cycle_seconds[0].labels == {}

        errors = samples_by_name(written, "eero_collector_errors_total")
        assert {s.labels["reason"] for s in errors} == {
            "auth",
            "api",
            "network",
            "rate_limit",
            "write",
            "unknown",
        }
        assert all(s.value == 0.0 for s in errors)


class TestTimestamps:
    """Every sample in a cycle shares one millisecond timestamp."""

    async def test_all_samples_share_one_ms_timestamp(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device()])
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        timestamps = {s.timestamp_ms for s in written}
        assert len(timestamps) == 1
        # Millisecond epoch, not seconds -- must be a 13-digit-scale integer.
        assert next(iter(timestamps)) > 10**12

    async def test_import_lines_are_valid_ndjson_with_ms_timestamps(self):
        """Sample.to_import_line() produces valid, ms-timestamped NDJSON."""
        import json

        sample = Sample(
            "eero_device_connected",
            1.0,
            1758547200000,
            labels={"network_id": "n1", "device_id": "d1"},
        )
        line = sample.to_import_line()
        parsed = json.loads(line)
        assert parsed["timestamps"] == [1758547200000]
        assert parsed["metric"]["__name__"] == "eero_device_connected"
        assert parsed["metric"]["network_id"] == "n1"


class TestOfflineAndAbsentDeviceRules:
    """§ 2.3 stale-series rules: offline-but-listed vs. absent devices."""

    async def test_offline_listed_device_writes_connected_zero(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response(
                [make_device(dev_id="offline-1", connected=False)]
            )
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        connected = samples_by_name(written, "eero_device_connected")
        assert len(connected) == 1
        assert connected[0].value == 0.0
        assert connected[0].labels["device_id"] == "offline-1"

    async def test_device_absent_from_api_is_not_written(
        self, autospec_client, fake_victoria
    ):
        """A device that disappears from get_devices() gets no sample at all."""
        autospec_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        assert samples_by_name(written, "eero_device_connected") == []


class TestPartialFailure:
    """A cycle that partially fails still writes what it gathered and counts the error."""

    async def test_devices_fetch_failure_still_writes_eero_metrics(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            side_effect=EeroAPIException(500, "boom")
        )
        autospec_client.get_eeros = AsyncMock(
            return_value=make_raw_response([make_eero()])
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()  # must not raise

        written = fake_victoria.written_batches[0]
        assert samples_by_name(written, "eero_eero_mesh_quality_bars")
        assert samples_by_name(written, "eero_device_connected") == []

        errors = {
            s.labels["reason"]: s.value
            for s in samples_by_name(written, "eero_collector_errors_total")
        }
        assert errors["api"] == 1.0

        up = samples_by_name(written, "eero_up")
        assert up[0].value == 0.0  # the cycle is not fully successful

    async def test_auth_error_mid_cycle_is_counted_as_auth(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            side_effect=EeroAuthenticationException("session expired")
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        errors = {
            s.labels["reason"]: s.value
            for s in samples_by_name(written, "eero_collector_errors_total")
        }
        assert errors["auth"] == 1.0

    async def test_network_error_is_counted_as_network(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_networks = AsyncMock(
            side_effect=EeroNetworkException("dns failure")
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        errors = {
            s.labels["reason"]: s.value
            for s in samples_by_name(written, "eero_collector_errors_total")
        }
        assert errors["network"] == 1.0
        up = samples_by_name(written, "eero_up")
        assert up[0].value == 0.0

    async def test_rate_limit_is_counted_and_backs_off_the_next_cycle(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            side_effect=EeroRateLimitException("slow down", retry_after=90.0)
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        errors = {
            s.labels["reason"]: s.value
            for s in samples_by_name(written, "eero_collector_errors_total")
        }
        assert errors["rate_limit"] == 1.0
        assert collector.next_delay() == 90.0
        # The backoff is consumed by one sleep; the cadence then returns to normal.
        assert collector.next_delay() == 10.0

    async def test_rate_limit_skips_the_rest_of_the_cycle(
        self, autospec_client, fake_victoria
    ):
        # Core reads (eeros, speed tests, DNS) run before the device read, so
        # the first rate-limited fetch is get_eeros and the later ones skip.
        autospec_client.get_eeros = AsyncMock(
            side_effect=EeroRateLimitException("slow down", retry_after=30.0)
        )
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device()])
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        # The coroutine is built but never awaited, so no request goes out.
        autospec_client.get_devices.assert_not_awaited()
        autospec_client.get_speed_tests.assert_not_awaited()
        written = fake_victoria.written_batches[0]
        errors = {
            s.labels["reason"]: s.value
            for s in samples_by_name(written, "eero_collector_errors_total")
        }
        assert errors["rate_limit"] == 1.0
        assert sum(errors.values()) == 1.0

        # The next cycle starts clean and calls the cloud again.
        autospec_client.get_eeros = AsyncMock(return_value=make_raw_response([]))
        await collector.run_cycle()
        autospec_client.get_devices.assert_awaited()

    async def test_rate_limit_backoff_is_capped(self, autospec_client, fake_victoria):
        autospec_client.get_devices = AsyncMock(
            side_effect=EeroRateLimitException("slow down", retry_after=86400.0)
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        assert collector.next_delay() == 3600.0

    async def test_rate_limit_without_retry_after_keeps_the_interval(
        self, autospec_client, fake_victoria
    ):
        autospec_client.get_devices = AsyncMock(
            side_effect=EeroRateLimitException("slow down")
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()

        assert collector.next_delay() == 10.0


class TestWriteFailure:
    """A write failure is logged and counted, and never propagates into the request path."""

    async def test_write_failure_is_counted_and_does_not_raise(
        self, autospec_client, fake_victoria
    ):
        fake_victoria.write = AsyncMock(side_effect=VictoriaWriteError("boom"))
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()  # must not raise

        assert collector.error_counts["write"] == 1

    async def test_write_failure_does_not_prevent_the_next_cycle(
        self, autospec_client, fake_victoria
    ):
        fake_victoria.write = AsyncMock(
            side_effect=[VictoriaWriteError("boom"), None],
        )
        collector = make_collector(autospec_client, fake_victoria)

        await collector.run_cycle()
        await collector.run_cycle()

        assert fake_victoria.write.call_count == 2


class TestTrickyLabelValues:
    """A label value with a quote, brace, backslash and newline survives construction."""

    async def test_device_name_with_special_characters_is_preserved(
        self, autospec_client, fake_victoria
    ):
        tricky = 'weird"name}with\\backslash\nand newline'
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device(name=tricky)])
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        connected = samples_by_name(written, "eero_device_connected")[0]
        assert connected.labels["name"] == tricky

        # And the sample must still serialize to valid, round-trippable JSON.
        import json

        parsed = json.loads(connected.to_import_line())
        assert parsed["metric"]["name"] == tricky


class TestGetEeroClientIsShared:
    """The collector must use the shared EeroClient, not construct its own."""

    async def test_collector_calls_the_provided_dependency_generator(
        self, autospec_client, fake_victoria
    ):
        calls = []

        async def get_eero_client():
            calls.append(1)
            yield autospec_client

        collector = MetricsCollector(
            get_eero_client, fake_victoria, interval_seconds=10
        )
        await collector.run_cycle()

        assert calls == [1]

    async def test_sdk_calls_use_network_id_keyword(
        self, autospec_client, fake_victoria
    ):
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        for call in autospec_client.get_devices.call_args_list:
            assert "network_id" in call.kwargs
        for call in autospec_client.get_eeros.call_args_list:
            assert "network_id" in call.kwargs
        for call in autospec_client.get_speed_tests.call_args_list:
            assert "network_id" in call.kwargs
        for call in autospec_client.get_dns_settings.call_args_list:
            assert "network_id" in call.kwargs


class TestMetricNamesAreSubsetOfPromQLLiterals:
    """CI guard: every metric name the collector emits that routes/metrics.py
    reads back by literal name must actually be produced by the collector.
    """

    async def test_metrics_py_promql_literals_are_produced_by_the_collector(
        self, autospec_client, fake_victoria
    ):
        import re

        text = _read_metrics_route_source()

        # The flag-gated WAN gauges are not produced by a default cycle; their
        # production is asserted in TestWanThroughput.
        literals = set(re.findall(r"\beero_[a-z_]+\b", text)) - {
            "eero_network_wan_download_mbps",
            "eero_network_wan_upload_mbps",
        }

        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device(signal=-50, score_bars=3)])
        )
        autospec_client.get_eeros = AsyncMock(
            return_value=make_raw_response([make_eero()])
        )
        autospec_client.get_speed_tests = AsyncMock(
            return_value=make_raw_response(
                [{"down": {"value": 1.0}, "up": {"value": 1.0}}]
            )
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()

        produced = {s.name for s in fake_victoria.written_batches[0]}
        missing = literals - produced
        assert (
            not missing
        ), f"routes/metrics.py references metrics the collector never emits: {missing}"


class TestMetricContractAllowlist:
    """Explicit, bidirectional drift guard for § 2.3's metric contract.

    An allowlist naming every metric the collector is permitted to emit --
    the eight "must stay continuous" contract names plus the six "we now
    own the collector" additions. Bidirectional so a future change in
    either direction (collector starts emitting an undocumented name, or
    stops emitting a contracted one) fails a test instead of silently
    drifting from § 2.3.
    """

    CONTRACT_METRICS = frozenset(
        {
            "eero_up",
            "eero_network_clients_count",
            "eero_speed_download_mbps",
            "eero_speed_upload_mbps",
            "eero_device_connected",
            "eero_device_signal_strength_dbm",
            "eero_device_connection_score_bars",
            "eero_eero_mesh_quality_bars",
        }
    )

    ADDED_METRICS = frozenset(
        {
            "eero_network_last_reboot_timestamp_seconds",
            "eero_eero_last_reboot_timestamp_seconds",
            "eero_network_dns_mode",
            "eero_eero_client_count",
            "eero_collector_cycle_seconds",
            "eero_collector_errors_total",
        }
    )

    ALLOWLIST = CONTRACT_METRICS | ADDED_METRICS

    # Live WAN throughput (issue #458): flag-gated, so absent from a default
    # (flag-off) cycle and kept out of ALLOWLIST. Read back by metrics.py.
    WAN_METRICS = frozenset(
        {"eero_network_wan_download_mbps", "eero_network_wan_upload_mbps"}
    )

    # Of the eight contract metrics, only these six are actually read back
    # by a surviving /api/metrics/* route today. The other two are written
    # for VictoriaMetrics history continuity (§ 2.3) but have no current
    # route: `eero_up` is a liveness signal checked via
    # ``victoria_client.health()``, not a named PromQL series, and
    # `eero_eero_mesh_quality_bars`'s only reader was the dead
    # `/metrics/eeros/{serial}/quality` route deleted in this revamp
    # (§ 2.4) for having zero frontend callers. This is intentional, not
    # drift -- pin it explicitly so a *change* in which contract metrics
    # are queryable is a deliberate, reviewed diff rather than a silent one.
    QUERIED_CONTRACT_METRICS = frozenset(
        {
            "eero_network_clients_count",
            "eero_speed_download_mbps",
            "eero_speed_upload_mbps",
            "eero_device_connected",
            "eero_device_signal_strength_dbm",
            "eero_device_connection_score_bars",
        }
    )
    UNQUERIED_CONTRACT_METRICS = frozenset({"eero_up", "eero_eero_mesh_quality_bars"})

    async def _run_full_cycle(self, autospec_client, fake_victoria):
        autospec_client.get_devices = AsyncMock(
            return_value=make_raw_response([make_device(signal=-50, score_bars=3)])
        )
        autospec_client.get_eeros = AsyncMock(
            return_value=make_raw_response(
                [make_eero(last_reboot="2026-05-01T08:30:00.000Z")]
            )
        )
        autospec_client.get_networks = AsyncMock(
            return_value=make_raw_response(
                [make_network(last_reboot="2026-05-01T08:00:00.000Z")]
            )
        )
        autospec_client.get_speed_tests = AsyncMock(
            return_value=make_raw_response(
                [{"down": {"value": 1.0}, "up": {"value": 1.0}}]
            )
        )
        collector = make_collector(autospec_client, fake_victoria)
        await collector.run_cycle()
        return {s.name for s in fake_victoria.written_batches[0]}

    async def test_produced_names_exactly_match_the_allowlist(
        self, autospec_client, fake_victoria
    ):
        """The collector emits exactly the 14 allowlisted names -- no more,
        no fewer -- on a fully successful flag-off cycle (the WAN gauges are
        flag-gated and covered by TestWanThroughput)."""
        produced = await self._run_full_cycle(autospec_client, fake_victoria)

        assert produced == self.ALLOWLIST, (
            f"undocumented names: {produced - self.ALLOWLIST}; "
            f"missing contracted names: {self.ALLOWLIST - produced}"
        )

    async def test_every_queried_contract_metric_appears_literally_in_metrics_py(
        self, autospec_client, fake_victoria
    ):
        """Reverse direction: every § 2.3 contract metric that is meant to
        be queryable today must actually be referenced by name in
        routes/metrics.py -- that is the whole point of the contract:
        existing PromQL keeps working across the exporter -> native-
        collector cutover. Exact equality (not just subset) so the day a
        route stops querying one of these, or starts querying a metric
        outside the contract, the test fails in either direction.
        """
        import re

        text = _read_metrics_route_source()
        literals = set(re.findall(r"\beero_[a-z_]+\b", text))

        expected = self.QUERIED_CONTRACT_METRICS | self.WAN_METRICS
        assert literals == expected, (
            f"missing from metrics.py: {expected - literals}; "
            f"unexpected in metrics.py: {literals - expected}"
        )

    async def test_unqueried_contract_metrics_are_still_produced(
        self, autospec_client, fake_victoria
    ):
        """`eero_up` and `eero_eero_mesh_quality_bars` have no surviving
        route today (see UNQUERIED_CONTRACT_METRICS's docstring) but must
        still be written every cycle for VictoriaMetrics history
        continuity -- this is what would break silently if someone "cleans
        up" what looks like a dead metric."""
        produced = await self._run_full_cycle(autospec_client, fake_victoria)

        assert self.UNQUERIED_CONTRACT_METRICS <= produced

    async def test_no_metric_name_used_by_metrics_py_is_outside_the_allowlist(
        self, autospec_client, fake_victoria
    ):
        """Every eero_* literal in routes/metrics.py is either a contract
        metric or an added one -- never an unlisted third name."""
        import re

        text = _read_metrics_route_source()
        literals = set(re.findall(r"\beero_[a-z_]+\b", text))

        undocumented = literals - self.ALLOWLIST - self.WAN_METRICS
        assert not undocumented, (
            "routes/metrics.py references metric names outside § 2.3's "
            f"contract/addition allowlist: {undocumented}"
        )


WAN_NAMES = ("eero_network_wan_download_mbps", "eero_network_wan_upload_mbps")


def make_wan_collector(client, victoria, enabled=True, clock=None) -> MetricsCollector:
    """Build a collector with the WAN flag on (or off) and an optional fake clock."""

    async def get_eero_client():
        yield client

    collector = MetricsCollector(
        get_eero_client, victoria, interval_seconds=10, wan_enabled=lambda: enabled
    )
    if clock is not None:
        collector._wan = WanTracker(clock=clock)
    return collector


class FakeClock:
    """A settable monotonic clock for the WAN throttle and expiry."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def wan_client(autospec_client):
    """An autospec client whose devices carry usage and whose burst succeeds."""
    autospec_client.create_burst_reporter = AsyncMock(
        return_value=make_raw_response({"next_burst": "later"})
    )
    autospec_client.get_devices = AsyncMock(
        return_value=make_raw_response(
            [
                make_device("a", mac="aa:aa:aa:aa:aa:01", usage=(3.5, 0.5)),
                make_device("b", mac="aa:aa:aa:aa:aa:02", usage=(6.5, 1.5)),
                make_device("c", mac="aa:aa:aa:aa:aa:03", connected=False),
            ]
        )
    )
    return autospec_client


@pytest.fixture
def wan_sleep(monkeypatch):
    """Replace the collector's asyncio.sleep so the settle wait is instant."""
    sleep = AsyncMock()
    monkeypatch.setattr("app.services.collector.asyncio.sleep", sleep)
    return sleep


def error_counts(batch) -> dict[str, float]:
    """The eero_collector_errors_total samples of one batch, keyed by reason."""
    return {
        s.labels["reason"]: s.value
        for s in samples_by_name(batch, "eero_collector_errors_total")
    }


class TestWanThroughput:
    """Live WAN throughput: flag-gated, burst-then-sum, absent when unknown."""

    @pytest.mark.parametrize("enabled", [None, False])
    async def test_flag_off_never_bursts_and_reads_devices_plainly(
        self, wan_client, fake_victoria, wan_sleep, enabled
    ):
        if enabled is None:
            collector = make_collector(wan_client, fake_victoria)
        else:
            collector = make_wan_collector(wan_client, fake_victoria, enabled=enabled)

        await collector.run_cycle()

        wan_client.create_burst_reporter.assert_not_called()
        wan_client.get_devices.assert_awaited_once_with(network_id="net-1")
        wan_sleep.assert_not_awaited()
        written = fake_victoria.written_batches[0]
        for name in WAN_NAMES:
            assert samples_by_name(written, name) == []

    async def test_flag_on_bursts_each_network_once_and_settles_once(
        self, wan_client, fake_victoria, wan_sleep, monkeypatch
    ):
        wan_client.get_networks = AsyncMock(
            return_value=make_raw_response(
                [make_network("net-1", "Home"), make_network("net-2", "Cabin")]
            )
        )
        ticks = iter(range(1, 100))
        monkeypatch.setattr(
            collector_module,
            "time",
            SimpleNamespace(
                monotonic=time.monotonic, time=lambda: 1000.0 * next(ticks)
            ),
        )
        collector = make_wan_collector(wan_client, fake_victoria)

        await collector.run_cycle()

        assert [c.args for c in wan_client.create_burst_reporter.await_args_list] == [
            ("net-1",),
            ("net-2",),
        ]
        assert sorted(
            c.kwargs["network_id"] for c in wan_client.get_devices.await_args_list
        ) == ["net-1", "net-2"]
        for call in wan_client.get_devices.await_args_list:
            assert call.kwargs["refresh_cache"] is True
        wan_sleep.assert_awaited_once_with(SETTLE_SECONDS)

        written = fake_victoria.written_batches[0]
        cycle_ts = samples_by_name(written, "eero_up")[0].timestamp_ms
        for name, expected in zip(WAN_NAMES, (10.0, 2.0), strict=True):
            found = samples_by_name(written, name)
            assert sorted(
                (s.labels["network_id"], s.labels["name"]) for s in found
            ) == [
                ("net-1", "Home"),
                ("net-2", "Cabin"),
            ]
            for sample in found:
                assert set(sample.labels) == {"network_id", "name"}
                assert sample.value == expected
                # The device read's own timestamp, not the cycle's.
                assert sample.timestamp_ms != cycle_ts

    async def test_cycle_orders_core_reads_then_bursts_then_devices(
        self, wan_client, fake_victoria, monkeypatch
    ):
        order: list[str] = []

        def record(name, mock):
            result = mock.return_value

            async def _call(*args, **kwargs):
                order.append(name)
                return result

            mock.side_effect = _call

        record("eeros", wan_client.get_eeros)
        record("speed", wan_client.get_speed_tests)
        record("dns", wan_client.get_dns_settings)
        record("burst", wan_client.create_burst_reporter)
        record("devices", wan_client.get_devices)

        async def fake_sleep(_seconds):
            order.append("sleep")

        monkeypatch.setattr("app.services.collector.asyncio.sleep", fake_sleep)
        wan_client.get_devices.return_value = make_raw_response(
            [make_device(usage=(1.0, 1.0))]
        )

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        assert order == ["eeros", "speed", "dns", "burst", "sleep", "devices"]

    async def test_bridge_mode_is_skipped_but_unknown_mode_is_eligible(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.get_networks = AsyncMock(
            return_value=make_raw_response(
                [
                    make_network("net-1", "Bridged", mode="bridge"),
                    make_network("net-2", "Unknown"),
                    make_network("net-3", "Nat", mode="nat"),
                ]
            )
        )
        collector = make_wan_collector(wan_client, fake_victoria)

        await collector.run_cycle()

        assert [c.args for c in wan_client.create_burst_reporter.await_args_list] == [
            ("net-2",),
            ("net-3",),
        ]
        written = fake_victoria.written_batches[0]
        wan_networks = {
            s.labels["network_id"]
            for name in WAN_NAMES
            for s in samples_by_name(written, name)
        }
        assert wan_networks == {"net-2", "net-3"}
        bridged = [
            c
            for c in wan_client.get_devices.await_args_list
            if c.kwargs["network_id"] == "net-1"
        ]
        assert [c.kwargs for c in bridged] == [{"network_id": "net-1"}]

    async def test_one_burst_per_minute_per_network(
        self, wan_client, fake_victoria, wan_sleep
    ):
        clock = FakeClock()
        collector = make_wan_collector(wan_client, fake_victoria, clock=clock)

        await collector.run_cycle()
        assert wan_client.create_burst_reporter.await_count == 1

        # 10 s later: throttled. Devices are read plainly and the same point
        # is re-emitted rather than a fake fresh one.
        clock.now += 10
        await collector.run_cycle()
        assert wan_client.create_burst_reporter.await_count == 1
        assert "refresh_cache" not in wan_client.get_devices.await_args.kwargs
        first, second = (
            samples_by_name(batch, WAN_NAMES[0])[0]
            for batch in fake_victoria.written_batches
        )
        assert (second.value, second.timestamp_ms) == (first.value, first.timestamp_ms)

        # 60 s after the first burst: due again.
        clock.now += 50
        await collector.run_cycle()
        assert wan_client.create_burst_reporter.await_count == 2
        assert wan_sleep.await_count == 2

    async def test_unknown_total_emits_no_sample(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.get_devices = AsyncMock(
            return_value=make_raw_response(
                [
                    make_device("a", usage=(1.0, 1.0)),
                    make_device("b", mac="aa:aa:aa:aa:aa:02"),
                ]  # b: no usage
            )
        )

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        written = fake_victoria.written_batches[0]
        for name in WAN_NAMES:
            assert samples_by_name(written, name) == []
        # Core device metrics are unaffected.
        assert samples_by_name(written, "eero_network_clients_count")

    async def test_no_connected_devices_is_a_known_zero(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.get_devices = AsyncMock(return_value=make_raw_response([]))

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        written = fake_victoria.written_batches[0]
        assert [
            s.value for name in WAN_NAMES for s in samples_by_name(written, name)
        ] == [
            0.0,
            0.0,
        ]

    async def test_malformed_device_payload_is_unknown_not_zero(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.get_devices = AsyncMock(return_value=make_raw_response("oops"))

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        written = fake_victoria.written_batches[0]
        for name in WAN_NAMES:
            assert samples_by_name(written, name) == []

    async def test_reading_older_than_expiry_is_not_emitted(
        self, wan_client, fake_victoria, wan_sleep
    ):
        clock = FakeClock()
        collector = make_wan_collector(wan_client, fake_victoria, clock=clock)
        await collector.run_cycle()
        assert samples_by_name(fake_victoria.written_batches[0], WAN_NAMES[0])

        # Past the expiry the next burst is due; it fails, so nothing fresh.
        wan_client.create_burst_reporter = AsyncMock(
            side_effect=EeroAPIException(500, "boom")
        )
        clock.now += EXPIRY_SECONDS + 1
        await collector.run_cycle()

        for name in WAN_NAMES:
            assert samples_by_name(fake_victoria.written_batches[1], name) == []

    async def test_burst_failure_is_counted_but_never_fails_the_cycle(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.create_burst_reporter = AsyncMock(
            side_effect=EeroAPIException(500, "boom")
        )
        wan_client.get_eeros = AsyncMock(return_value=make_raw_response([make_eero()]))

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        written = fake_victoria.written_batches[0]
        assert error_counts(written)["api"] == 1.0
        assert samples_by_name(written, "eero_up")[0].value == 1.0
        for name in WAN_NAMES:
            assert samples_by_name(written, name) == []
        assert samples_by_name(written, "eero_network_clients_count")
        assert samples_by_name(written, "eero_eero_client_count")
        wan_sleep.assert_not_awaited()
        wan_client.get_devices.assert_awaited_once_with(network_id="net-1")

    async def test_failed_burst_is_throttled_like_a_successful_one(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.create_burst_reporter = AsyncMock(
            side_effect=EeroAPIException(500, "boom")
        )
        clock = FakeClock()
        collector = make_wan_collector(wan_client, fake_victoria, clock=clock)

        await collector.run_cycle()
        clock.now += 10
        await collector.run_cycle()

        assert wan_client.create_burst_reporter.await_count == 1

    async def test_burst_rate_limit_is_counted_and_honours_retry_after(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.create_burst_reporter = AsyncMock(
            side_effect=EeroRateLimitException("slow down", retry_after=45.0)
        )
        collector = make_wan_collector(wan_client, fake_victoria)

        await collector.run_cycle()

        written = fake_victoria.written_batches[0]
        assert error_counts(written)["rate_limit"] == 1.0
        assert collector.next_delay() == 45.0
        for name in WAN_NAMES:
            assert samples_by_name(written, name) == []

    async def test_a_failing_network_does_not_block_the_others_burst(
        self, wan_client, fake_victoria, wan_sleep
    ):
        wan_client.get_networks = AsyncMock(
            return_value=make_raw_response(
                [make_network("net-1", "Home"), make_network("net-2", "Cabin")]
            )
        )

        async def burst(network_id):
            if network_id == "net-1":
                raise EeroAPIException(500, "boom")
            return make_raw_response({})

        wan_client.create_burst_reporter = AsyncMock(side_effect=burst)

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        written = fake_victoria.written_batches[0]
        assert {
            s.labels["network_id"] for s in samples_by_name(written, WAN_NAMES[0])
        } == {"net-2"}
        wan_sleep.assert_awaited_once_with(SETTLE_SECONDS)

    async def test_device_fetch_failure_drops_the_stale_reading(
        self, wan_client, fake_victoria, wan_sleep
    ):
        clock = FakeClock()
        collector = make_wan_collector(wan_client, fake_victoria, clock=clock)
        await collector.run_cycle()
        assert samples_by_name(fake_victoria.written_batches[0], WAN_NAMES[0])

        wan_client.get_devices = AsyncMock(side_effect=EeroAPIException(500, "boom"))
        clock.now += 10  # throttled, reading still within the expiry
        await collector.run_cycle()

        for name in WAN_NAMES:
            assert samples_by_name(fake_victoria.written_batches[1], name) == []

    async def test_turning_the_flag_off_forgets_the_reading(
        self, wan_client, fake_victoria, wan_sleep
    ):
        state = {"on": True}

        async def get_eero_client():
            yield wan_client

        collector = MetricsCollector(
            get_eero_client,
            fake_victoria,
            interval_seconds=10,
            wan_enabled=lambda: state["on"],
        )
        await collector.run_cycle()
        state["on"] = False
        await collector.run_cycle()
        state["on"] = True
        await collector.run_cycle()  # throttled (real clock): no burst, no stale point

        assert samples_by_name(fake_victoria.written_batches[0], WAN_NAMES[0])
        assert samples_by_name(fake_victoria.written_batches[1], WAN_NAMES[0]) == []
        assert samples_by_name(fake_victoria.written_batches[2], WAN_NAMES[0]) == []

    async def test_every_wan_name_in_metrics_py_is_produced_when_enabled(
        self, wan_client, fake_victoria, wan_sleep
    ):
        import re

        literals = set(re.findall(r"\beero_[a-z_]+\b", _read_metrics_route_source()))
        wan_literals = {name for name in literals if "wan" in name}
        assert wan_literals == set(WAN_NAMES)

        await make_wan_collector(wan_client, fake_victoria).run_cycle()

        produced = {s.name for s in fake_victoria.written_batches[0]}
        assert wan_literals <= produced
