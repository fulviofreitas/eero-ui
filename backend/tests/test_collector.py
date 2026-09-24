"""Tests for the metrics collector.

Covers phase-6.0-revamp.md § 2.3 (the metric contract) and § 8.1 (the
required test scenarios): every named metric with its exact label-key set,
NDJSON-with-ms-timestamps payload shape, the unauthenticated cycle, partial
failure, write failure, the tricky-label round trip, and the offline vs.
absent device rules.
"""

from unittest.mock import AsyncMock, create_autospec

import pytest
from eero import EeroClient
from eero.exceptions import (
    EeroAPIException,
    EeroAuthenticationException,
    EeroNetworkException,
)

from app.routes import metrics as metrics_route
from app.services.collector import MetricsCollector
from app.services.victoria import Sample, VictoriaMetricsClient, VictoriaWriteError


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


def make_network(net_id="net-1", name="Home", last_reboot=None):
    """Build a minimal raw network dict."""
    net: dict = {"url": f"/2.2/networks/{net_id}", "name": name}
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
):
    """Build a minimal raw device dict matching the eero API's shape."""
    return {
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
def autospec_client():
    """A create_autospec(EeroClient, instance=True) mock, authenticated by default.

    Using autospec means a renamed or removed SDK method fails the test at
    call time instead of silently returning a non-awaitable MagicMock.
    """
    client = create_autospec(EeroClient, instance=True)
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

        source = metrics_route.__file__
        with open(source, encoding="utf-8") as f:
            text = f.read()

        literals = set(re.findall(r"\beero_[a-z_]+\b", text))

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
