"""Live WAN throughput from eero's per-client Internet usage.

The device list reports zero or stale per-client usage until a "burst
reporter" is requested for the network. This module wraps that request
(``EeroClient.create_burst_reporter``, public since eero-api 8.4.0), sums the
refreshed per-client usage into one WAN total, and tracks per-network
throttle and expiry state. It uses only the public SDK surface -- no private
SDK attributes, no manual token handling -- and is guarded by
``tests/test_no_sdk_private_access.py``.

``create_burst_reporter`` is a POST, live-verified in eero-api 8.4.1 (usage
refreshed within 12 s, no node rebooted). The collector still calls it only
when ``Settings.wan_live_usage`` is on, because it costs a settle wait per
cycle and one cloud write per minute per network. The total counts Internet
traffic only; local LAN transfers are not included in the per-client usage
the cloud reports.
"""

import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from eero import EeroClient

# Seconds the cloud needs before refreshed per-client usage is available.
SETTLE_SECONDS = 12
# eero allows one burst per minute per network.
MIN_INTERVAL_SECONDS = 60
# A reading older than this is "unknown" and is no longer emitted.
EXPIRY_SECONDS = 90


async def request_burst(client: EeroClient, network_id: str) -> None:
    """Ask the eero cloud to refresh per-client usage for one network.

    Does not sleep: the settle wait lives in the collector so a single wait
    covers every network. The response body is ignored and errors propagate.

    Args:
        client: The shared EeroClient.
        network_id: The network to request a burst for.
    """
    await client.create_burst_reporter(network_id)


def aggregate_wan_usage(devices: list[dict[str, Any]]) -> tuple[float, float] | None:
    """Sum connected clients' Internet usage once each.

    Devices are deduplicated by lower-cased MAC (falling back to ``url``).
    An incomplete total is unknown, never zero.

    Args:
        devices: Raw device dicts from the device list.

    Returns:
        ``(download_mbps, upload_mbps)``; ``(0.0, 0.0)`` when no device is
        connected; ``None`` if any device is not a dict or any connected
        device has missing or invalid (non-numeric, bool, NaN, infinite,
        negative) usage.
    """
    download = upload = 0.0
    seen: set[str] = set()
    for device in devices:
        if not isinstance(device, dict):
            return None
        if not device.get("connected"):
            continue
        identity = device.get("mac") or device.get("url")
        if isinstance(identity, str):
            identity = identity.lower()
            if identity in seen:
                continue
            seen.add(identity)
        usage = device.get("usage")
        if not isinstance(usage, dict):
            return None
        down, up = usage.get("down_mbps"), usage.get("up_mbps")
        for value in (down, up):
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value < 0
            ):
                return None
        download += down
        upload += up
    if not math.isfinite(download) or not math.isfinite(upload):
        return None
    return download, upload


@dataclass
class WanReading:
    """One aggregated WAN reading for a network."""

    down_mbps: float
    up_mbps: float
    taken_monotonic: float
    timestamp_ms: int


class WanTracker:
    """Per-network burst throttle and reading-expiry state."""

    def __init__(self, clock: Callable[[], float] | None = None) -> None:
        """Initialize the tracker.

        Args:
            clock: A monotonic clock in seconds; defaults to
                ``time.monotonic``. Injectable for tests.
        """
        self._clock: Callable[[], float] = clock or time.monotonic
        self._last_attempt: dict[str, float] = {}
        self._readings: dict[str, WanReading] = {}

    def due(self, network_id: str) -> bool:
        """Whether a burst may be requested for ``network_id`` now."""
        last = self._last_attempt.get(network_id)
        return last is None or self._clock() - last >= MIN_INTERVAL_SECONDS

    def mark_attempt(self, network_id: str) -> None:
        """Stamp a burst attempt, so a failed burst is throttled too."""
        self._last_attempt[network_id] = self._clock()

    def store(
        self, network_id: str, rates: tuple[float, float], timestamp_ms: int
    ) -> None:
        """Remember a fresh reading.

        Args:
            network_id: The network the reading belongs to.
            rates: ``(download_mbps, upload_mbps)``.
            timestamp_ms: Wall-clock time of the device read, in ms.
        """
        self._readings[network_id] = WanReading(
            down_mbps=rates[0],
            up_mbps=rates[1],
            taken_monotonic=self._clock(),
            timestamp_ms=timestamp_ms,
        )

    def current(self, network_id: str) -> WanReading | None:
        """The reading for ``network_id``, or None if absent or expired."""
        reading = self._readings.get(network_id)
        if reading is None:
            return None
        if self._clock() - reading.taken_monotonic > EXPIRY_SECONDS:
            return None
        return reading

    def forget(self, network_id: str) -> None:
        """Drop the stored reading for ``network_id`` (keeps the throttle)."""
        self._readings.pop(network_id, None)
