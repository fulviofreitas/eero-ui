"""Live WAN totals must not confuse absent counters or link rates with usage."""

from unittest.mock import AsyncMock

import pytest
from eero.exceptions import EeroAPIException, EeroAuthenticationException

from app.services import wan
from app.services.wan import (
    EXPIRY_SECONDS,
    MIN_INTERVAL_SECONDS,
    WanTracker,
    aggregate_wan_usage,
    request_burst,
)


@pytest.fixture
def autospec_client(_clone_eero_client):
    """An autospec'd EeroClient, so a renamed SDK method fails the test."""
    return _clone_eero_client()


def device(down=3.5, up=0.25, **extra):
    """Build a connected client with configurable Internet usage and optional raw fields."""
    return {"connected": True, "usage": {"down_mbps": down, "up_mbps": up}, **extra}


def test_sums_clients_once_ignoring_disconnected_usage_and_link_rates():
    """Deduplicate clients and exclude disconnected usage and physical link rates."""
    first = device(mac="AA:BB")
    assert aggregate_wan_usage(
        [
            first,
            device(mac="aa:bb"),
            device(6.5, 0.75, mac="CC:DD", connectivity={"rx_bitrate": "1000 Mbit/s"}),
            device(900, 800, connected=False),
        ]
    ) == (10, 1)


def test_devices_without_a_mac_dedupe_by_url():
    """The url is the identity fallback, compared case-insensitively."""
    assert aggregate_wan_usage(
        [device(url="/2.2/Devices/X"), device(url="/2.2/devices/x")]
    ) == (3.5, 0.25)


@pytest.mark.parametrize(
    "devices", [[], [device(0, 0)], [device(20, 10, connected=False)]]
)
def test_true_idle_totals_are_zero(devices):
    """Retain zero for valid idle clients and networks with no connected devices."""
    assert aggregate_wan_usage(devices) == (0, 0)


@pytest.mark.parametrize("bad", [None, "2", True, -1, float("nan"), float("inf")])
@pytest.mark.parametrize("direction", ["down_mbps", "up_mbps"])
def test_partial_invalid_totals_are_unknown(bad, direction):
    """Reject incomplete totals containing nonnumeric, negative or nonfinite rates."""
    second = device()
    second["usage"][direction] = bad
    assert aggregate_wan_usage([device(mac="a"), second]) is None


@pytest.mark.parametrize("usage", [None, {}, "unsupported"])
def test_missing_usage_is_not_zero(usage):
    """Treat missing or malformed client usage as unknown instead of zero traffic."""
    assert aggregate_wan_usage([device(usage=usage)]) is None


def test_non_dict_device_makes_the_total_unknown():
    """One unreadable entry means the sum cannot be trusted."""
    assert aggregate_wan_usage([device(), "oops"]) is None  # type: ignore[list-item]


def test_one_good_and_one_bad_device_is_unknown_not_a_partial_sum():
    """Unknown beats zero: a partial sum would under-report."""
    assert aggregate_wan_usage([device(mac="a"), device(None, mac="b")]) is None


def test_overflowing_sum_is_unknown():
    """Two finite maxima overflow to infinity, which is not a valid total."""
    assert aggregate_wan_usage([device(1e308, mac="a"), device(1e308, mac="b")]) is None


async def test_request_burst_awaits_create_burst_reporter_once(autospec_client):
    """The public SDK method is called with the network id and nothing else."""
    autospec_client.create_burst_reporter = AsyncMock(return_value={"data": {}})

    assert await request_burst(autospec_client, "net-1") is None

    autospec_client.create_burst_reporter.assert_awaited_once_with("net-1")


@pytest.mark.parametrize(
    "error", [EeroAPIException(500, "boom"), EeroAuthenticationException("no")]
)
async def test_request_burst_propagates_sdk_errors(autospec_client, error):
    """Errors are the collector's to classify; none is swallowed here."""
    autospec_client.create_burst_reporter = AsyncMock(side_effect=error)

    with pytest.raises(type(error)):
        await request_burst(autospec_client, "net-1")


async def test_request_burst_does_not_sleep(autospec_client, monkeypatch):
    """The settle wait lives in the collector so one wait covers all networks."""
    autospec_client.create_burst_reporter = AsyncMock(return_value={})
    sleep = AsyncMock()
    monkeypatch.setattr("asyncio.sleep", sleep)

    await request_burst(autospec_client, "net-1")

    sleep.assert_not_awaited()


class TestWanTracker:
    """Throttle and expiry state, driven by an injected clock."""

    @staticmethod
    def make():
        now = [100.0]
        return WanTracker(clock=lambda: now[0]), now

    def test_a_new_network_is_due(self):
        tracker, _ = self.make()
        assert tracker.due("net-1") is True

    def test_not_due_until_the_interval_has_passed(self):
        tracker, now = self.make()
        tracker.mark_attempt("net-1")

        now[0] += MIN_INTERVAL_SECONDS - 1
        assert tracker.due("net-1") is False
        now[0] += 1
        assert tracker.due("net-1") is True

    def test_throttle_is_per_network(self):
        tracker, _ = self.make()
        tracker.mark_attempt("net-1")
        assert tracker.due("net-2") is True

    def test_current_is_none_without_a_reading(self):
        tracker, _ = self.make()
        assert tracker.current("net-1") is None

    def test_store_then_current_returns_the_reading(self):
        tracker, _ = self.make()
        tracker.store("net-1", (10.0, 2.0), 1_700_000_000_000)

        reading = tracker.current("net-1")

        assert reading is not None
        assert (reading.down_mbps, reading.up_mbps) == (10.0, 2.0)
        assert reading.timestamp_ms == 1_700_000_000_000

    def test_reading_expires_after_the_expiry_window(self):
        tracker, now = self.make()
        tracker.store("net-1", (10.0, 2.0), 1)

        now[0] += EXPIRY_SECONDS
        assert tracker.current("net-1") is not None
        now[0] += 0.001
        assert tracker.current("net-1") is None

    def test_forget_drops_the_reading_but_keeps_the_throttle(self):
        tracker, _ = self.make()
        tracker.mark_attempt("net-1")
        tracker.store("net-1", (1.0, 1.0), 1)

        tracker.forget("net-1")

        assert tracker.current("net-1") is None
        assert tracker.due("net-1") is False

    def test_forget_of_an_unknown_network_is_a_noop(self):
        tracker, _ = self.make()
        tracker.forget("nope")

    def test_default_clock_is_monotonic(self):
        tracker = WanTracker()
        tracker.mark_attempt("net-1")
        assert tracker.due("net-1") is False


def test_constants_match_the_documented_contract():
    """eero allows one burst a minute; a reading outlives one throttled gap."""
    assert wan.MIN_INTERVAL_SECONDS == 60
    assert wan.EXPIRY_SECONDS == 90
    assert wan.SETTLE_SECONDS == 12
    assert wan.EXPIRY_SECONDS > wan.MIN_INTERVAL_SECONDS
