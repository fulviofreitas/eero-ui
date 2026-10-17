"""Metrics collector: reads through EeroClient, writes to VictoriaMetrics.

Replaces eero-prometheus-exporter (see ``.claude/tasks/phase-6.0-revamp.md``
§ 2.2). A single asyncio task, started from the FastAPI lifespan, wakes
every ``Settings.collection_interval`` seconds, reads the current network
state through the shared ``EeroClient`` singleton, normalises it with
``transformers.py``, and writes the § 2.3 metric contract into
VictoriaMetrics via ``VictoriaMetricsClient.write()``.

Design decisions (see phase-6.0-revamp.md § 2.3 for the contract this
implements):

- ``eero_network_clients_count`` is computed as the count of devices with
  a truthy ``connected`` flag, matching eero-prometheus-exporter's actual
  collection code (not the wiki's simplified "network envelope" summary,
  which the exporter's own code does not use).
- ``eero_network_dns_mode`` carries the IPv4 DNS mode as "the" mode
  (``normalize_dns(...)["ipv4"]["mode"]``), matching the exporter's only
  non-info-metric read of ``dns.mode`` -- there is no single "the" mode
  across IPv4/IPv6 families in the eero data model, and the metric
  contract only budgets one ``mode`` label per network, not a family
  label.
- Every label value is coerced to ``str`` and defaults to ``""`` rather
  than an "unknown" sentinel, per this work package's spec, even though
  it differs from eero-prometheus-exporter's "unknown" convention.
- ``eero_collector_errors_total{reason}`` always emits one sample per
  known reason every cycle (including reasons with a zero count so far),
  so the series never gaps just because a particular failure mode has not
  yet occurred -- consistent with the collector's own self-observability
  goal.
"""

import asyncio
import inspect
import logging
import time
from collections import defaultdict
from collections.abc import AsyncGenerator, Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from eero import EeroClient
from eero.exceptions import (
    EeroAPIException,
    EeroAuthenticationException,
    EeroException,
    EeroNetworkException,
    EeroRateLimitException,
    EeroTimeoutException,
)

from ..transformers import (
    extract_data,
    extract_list,
    normalize_device,
    normalize_dns,
    normalize_eero,
    normalize_network,
    normalize_speed_test,
)
from .victoria import Sample, VictoriaMetricsClient, VictoriaWriteError
from .wan import EXPIRY_SECONDS as WAN_EXPIRY
from .wan import MIN_INTERVAL_SECONDS as WAN_INTERVAL
from .wan import aggregate_wan_usage, prepare_wan_sample

_LOGGER = logging.getLogger(__name__)

# Every reason bucket eero_collector_errors_total{reason} can carry. Kept as
# an explicit, closed set so the metric always emits the same label values
# every cycle (see module docstring).
_ERROR_REASONS = ("auth", "api", "network", "rate_limit", "write", "unknown")

# Upper bound on how long a rate limit can push the next cycle out. The SDK
# already caps a parsed ``Retry-After`` at one day; an hour keeps the
# collector recovering on its own even if the cloud asks for far longer.
_MAX_RATE_LIMIT_BACKOFF_SECONDS = 3600.0


def _label(value: Any) -> str:
    """Coerce a raw value to a label-safe string.

    Args:
        value: A raw (possibly None) value from a normalized dict.

    Returns:
        ``str(value)``, or ``""`` when ``value`` is None -- label values
        must never be None.
    """
    if value is None:
        return ""
    return str(value)


def _reason_for_exception(exc: Exception) -> str:
    """Classify an exception into one of the fixed error-counter reasons.

    Args:
        exc: The exception raised by an SDK call or a write.

    Returns:
        One of ``_ERROR_REASONS``.
    """
    if isinstance(exc, VictoriaWriteError):
        return "write"
    if isinstance(exc, EeroAuthenticationException):
        return "auth"
    if isinstance(exc, EeroRateLimitException):
        return "rate_limit"
    if isinstance(exc, (EeroNetworkException, EeroTimeoutException)):
        return "network"
    if isinstance(exc, EeroAPIException):
        return "api"
    return "unknown"


def _parse_iso_timestamp_to_epoch_seconds(value: str | None) -> float | None:
    """Parse an eero API ISO-8601 timestamp into Unix epoch seconds.

    Handles the trailing-``Z`` shape the eero API uses, with or without
    fractional seconds, without requiring a timezone-aware format string.

    Args:
        value: The raw timestamp string (e.g. ``"2026-05-01T08:30:00.000Z"``).

    Returns:
        Epoch seconds, or None if ``value`` is missing or unparseable.
    """
    if not value:
        return None
    candidate = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.timestamp()


class MetricsCollector:
    """Collects eero network state on an interval and writes it to VictoriaMetrics.

    The collector shares the application's single ``EeroClient`` instance
    (via the ``get_eero_client`` dependency generator) rather than
    constructing its own, per phase-6.0-revamp.md § 2.2.
    """

    def __init__(
        self,
        get_eero_client: Callable[[], AsyncGenerator[EeroClient, None]],
        victoria_client: VictoriaMetricsClient,
        interval_seconds: int = 60,
        publish_samples: Callable[[list[Sample]], None] | None = None,
        wan_enabled: Callable[[], bool] | None = None,
    ) -> None:
        """Initialize the collector.

        Args:
            get_eero_client: The ``get_eero_client`` dependency generator
                function (not a call result) -- called fresh each cycle so
                the collector always observes the current singleton.
            victoria_client: The shared VictoriaMetrics client to write to.
            interval_seconds: Seconds to sleep between collection cycles.
        """
        self._get_eero_client = get_eero_client
        self._victoria = victoria_client
        self._interval_seconds = max(10, interval_seconds)
        self._error_counts: dict[str, int] = defaultdict(int)
        # Longest Retry-After seen since the last sleep; 0.0 when none.
        self._rate_limit_backoff = 0.0
        # Set by the first rate-limited fetch; skips the rest of the cycle.
        self._rate_limited_this_cycle = False
        self._publish_samples = publish_samples
        self._wan_enabled = wan_enabled
        self._wan_last_attempt: dict[str, float] = {}
        self._wan_readings: dict[str, tuple[float, tuple[float, float], int]] = {}

    @property
    def error_counts(self) -> dict[str, int]:
        """Cumulative error counts by reason, since process start."""
        return dict(self._error_counts)

    def _count_error(self, reason: str) -> None:
        """Increment the in-process error counter for ``reason``.

        Args:
            reason: One of ``_ERROR_REASONS``.
        """
        self._error_counts[reason] += 1

    def _note_rate_limit(self, exc: EeroRateLimitException) -> None:
        """Remember the cloud's ``Retry-After`` so the next sleep honours it.

        Args:
            exc: The rate-limit exception; ``retry_after`` is ``None`` when the
                response carried no usable ``Retry-After`` header.
        """
        if exc.retry_after is not None:
            self._rate_limit_backoff = max(
                self._rate_limit_backoff,
                min(exc.retry_after, _MAX_RATE_LIMIT_BACKOFF_SECONDS),
            )

    def next_delay(self) -> float:
        """Seconds to sleep before the next cycle, consuming any pending backoff.

        Returns:
            ``interval_seconds``, or a longer rate-limit backoff recorded
            during the cycle that just ran.
        """
        delay = max(float(self._interval_seconds), self._rate_limit_backoff)
        self._rate_limit_backoff = 0.0
        return delay

    async def run_forever(self) -> None:
        """Run collection cycles forever, sleeping between them.

        Sleeps ``interval_seconds``, or longer when the eero cloud
        rate-limited the last cycle with a ``Retry-After`` (see
        ``next_delay``). Intended to be wrapped in an ``asyncio.Task`` by the
        lifespan and cancelled on shutdown; a cancellation propagates
        normally.
        """
        while True:
            try:
                await self.run_cycle()
            except Exception:  # pylint: disable=broad-exception-caught
                # Deliberate fail-safe: never let a cycle kill the task.
                _LOGGER.warning(
                    "Unhandled error in metrics collector cycle", exc_info=True
                )
            delay = self.next_delay()
            if delay > self._interval_seconds:
                _LOGGER.warning(
                    "eero cloud rate-limited the metrics collector; "
                    "next cycle in %.0f seconds",
                    delay,
                )
            await asyncio.sleep(delay)

    async def _current_client(self) -> EeroClient:
        """Fetch the shared EeroClient instance from its dependency generator.

        ``get_eero_client`` has no cleanup code after its single ``yield``,
        so closing the generator immediately after taking that value is
        safe and does not tear down the shared singleton it yields.

        Returns:
            The singleton EeroClient.
        """
        agen = self._get_eero_client()
        try:
            return await anext(agen)
        finally:
            await agen.aclose()

    async def _safe_fetch(
        self, awaitable: Awaitable[Any], action: str
    ) -> tuple[Any, bool]:
        """Await one client call, logging and counting on failure.

        Every per-resource fetch (networks, devices, eeros, speed tests, DNS
        settings) needs the same "log at WARNING, count the error, and let
        the cycle continue" handling -- shared here rather than repeated in
        each ``_collect_*`` method.

        Once a fetch is rate-limited, every later fetch in the same cycle is
        skipped without contacting the cloud (and without counting another
        error), so one limit costs one request rather than one per resource.

        Returns:
            ``(result, True)`` on success; ``(None, False)`` if the call
            raised (the reason or "unknown" has already been counted) or was
            skipped after a rate limit.
        """
        if self._rate_limited_this_cycle:
            if inspect.iscoroutine(awaitable):
                awaitable.close()  # never started; avoids "never awaited"
            return None, False
        try:
            return await awaitable, True
        except EeroException as exc:
            if isinstance(exc, EeroRateLimitException):
                self._rate_limited_this_cycle = True
                self._note_rate_limit(exc)
            reason = _reason_for_exception(exc)
            _LOGGER.warning("Metrics collector failed to %s: %s", action, reason)
            self._count_error(reason)
            return None, False
        except Exception:  # pylint: disable=broad-exception-caught
            # Deliberate fail-safe: one unexpected error must not abort the cycle.
            _LOGGER.warning(
                "Metrics collector failed to %s (unexpected)", action, exc_info=True
            )
            self._count_error("unknown")
            return None, False

    async def run_cycle(self) -> None:
        """Run a single collection cycle and write its samples to VictoriaMetrics.

        Never raises: any failure is logged at WARNING and counted in
        ``eero_collector_errors_total``, and whatever samples were
        successfully gathered are still written.
        """
        cycle_start = time.monotonic()
        now_ms = int(time.time() * 1000)
        samples: list[Sample] = []
        self._rate_limited_this_cycle = False

        try:
            client = await self._current_client()
        except Exception:  # pylint: disable=broad-exception-caught
            # Deliberate fail-safe: run_cycle() must never raise (see docstring).
            _LOGGER.warning(
                "Metrics collector could not obtain EeroClient", exc_info=True
            )
            self._count_error("unknown")
            client = None
            cycle_ok = False
        else:
            cycle_ok = await self._collect_all_networks(client, samples, now_ms)

        samples.append(Sample("eero_up", 1.0 if cycle_ok else 0.0, now_ms))
        samples.append(
            Sample(
                "eero_collector_cycle_seconds",
                time.monotonic() - cycle_start,
                now_ms,
            )
        )
        for reason in _ERROR_REASONS:
            samples.append(
                Sample(
                    "eero_collector_errors_total",
                    float(self._error_counts.get(reason, 0)),
                    now_ms,
                    labels={"reason": reason},
                )
            )

        try:
            await self._victoria.write(samples)
        except VictoriaWriteError:
            self._count_error("write")
            _LOGGER.warning("Metrics collector failed to write to VictoriaMetrics")

        if self._publish_samples is not None:
            try:
                self._publish_samples(samples)
            except Exception:
                _LOGGER.warning("MQTT could not publish collected metrics")

    async def _collect_all_networks(
        self, client: EeroClient, samples: list[Sample], now_ms: int
    ) -> bool:
        """List networks (if authenticated) and collect every metric for each.

        Returns:
            False if the client is unauthenticated, listing networks failed,
            or any individual network's collection failed; True otherwise.
        """
        # nosemgrep: python.lang.maintainability.is-function-without-parentheses.is-function-without-parentheses
        if not client.is_authenticated:
            return False

        raw_networks, ok = await self._safe_fetch(
            client.get_networks(), "list networks"
        )
        if not ok:
            return False

        cycle_ok = True
        networks = [
            normalize_network(raw) for raw in extract_list(raw_networks, "networks")
        ]
        for network in networks:
            network_id = network.get("id")
            if not network_id:
                _LOGGER.debug("Skipping network with no resolvable id")
                continue
            network_ok = await self._collect_network(
                client, network_id, network, samples, now_ms
            )
            cycle_ok = cycle_ok and network_ok
        return cycle_ok

    async def _collect_network(
        self,
        client: EeroClient,
        network_id: str,
        network: dict[str, Any],
        samples: list[Sample],
        now_ms: int,
    ) -> bool:
        """Collect and append every metric for one network.

        Args:
            client: The shared EeroClient.
            network_id: The network's resolved id.
            network: The normalized network dict.
            samples: The list to append this network's samples to.
            now_ms: The single timestamp (ms) shared by the whole cycle.

        Returns:
            True if every sub-fetch for this network succeeded, False if
            any part failed (whatever succeeded is still appended).
        """
        network_ok = True

        network_ok &= await self._collect_devices(
            client,
            network_id,
            _label(network.get("name")),
            samples,
            now_ms,
            collect_wan=bool(
                self._wan_enabled
                and self._wan_enabled()
                and network.get("connection_mode") != "BRIDGE"
            ),
        )
        network_ok &= await self._collect_eeros(client, network_id, samples, now_ms)
        network_ok &= await self._collect_speed_tests(
            client, network_id, samples, now_ms
        )
        network_ok &= await self._collect_dns_mode(client, network_id, samples, now_ms)

        last_reboot = _parse_iso_timestamp_to_epoch_seconds(network.get("last_reboot"))
        if last_reboot is not None:
            samples.append(
                Sample(
                    "eero_network_last_reboot_timestamp_seconds",
                    last_reboot,
                    now_ms,
                    labels={"network_id": network_id},
                )
            )

        return network_ok

    async def _collect_devices(
        self,
        client: EeroClient,
        network_id: str,
        network_name: str,
        samples: list[Sample],
        now_ms: int,
        collect_wan: bool = False,
    ) -> bool:
        """Collect device-scoped metrics for one network, plus its client count.

        Returns:
            True on success, False if the underlying fetch failed.
        """
        wan_ready = False
        if not collect_wan:
            self._wan_readings.pop(network_id, None)
        elif (
            time.monotonic() - self._wan_last_attempt.get(network_id, float("-inf"))
            >= WAN_INTERVAL
        ):
            self._wan_last_attempt[network_id] = time.monotonic()
            self._wan_readings.pop(network_id, None)
            _, wan_ready = await self._safe_fetch(
                prepare_wan_sample(client, network_id), "request live WAN usage"
            )

        devices_call = (
            client.get_devices(network_id=network_id, refresh_cache=True)
            if wan_ready
            else client.get_devices(network_id=network_id)
        )
        raw_devices, ok = await self._safe_fetch(devices_call, "list devices")
        if not ok:
            self._wan_readings.pop(network_id, None)
            return False

        raw_device_list = extract_list(raw_devices, "devices")
        valid_list = isinstance(raw_devices, list) or (
            isinstance(raw_devices, dict) and isinstance(raw_devices.get("data"), list)
        )
        if wan_ready and valid_list:
            rates = aggregate_wan_usage(raw_device_list)
            if rates is not None:
                self._wan_readings[network_id] = (
                    time.monotonic(),
                    rates,
                    int(time.time() * 1000),
                )
        reading = self._wan_readings.get(network_id)
        if collect_wan and reading and time.monotonic() - reading[0] < WAN_EXPIRY:
            for direction, value in zip(
                ("download", "upload"), reading[1], strict=True
            ):
                samples.append(
                    Sample(
                        f"eero_network_wan_{direction}_mbps",
                        value,
                        reading[2],
                        labels={"network_id": network_id, "name": network_name},
                    )
                )
        connected_count = 0

        for raw_device in raw_device_list:
            device = normalize_device(raw_device)
            device_id = device.get("id")
            if not device_id:
                _LOGGER.debug("Skipping device with no resolvable id")
                continue

            if self._collect_device_samples(
                network_id, device_id, device, samples, now_ms
            ):
                connected_count += 1

        samples.append(
            Sample(
                "eero_network_clients_count",
                float(connected_count),
                now_ms,
                labels={"network_id": network_id, "name": network_name},
            )
        )
        return True

    def _collect_device_samples(
        self,
        network_id: str,
        device_id: str,
        device: dict[str, Any],
        samples: list[Sample],
        now_ms: int,
    ) -> bool:
        """Append every per-device sample for one device.

        Returns:
            True if the device is connected (for the caller's client count).
        """
        connected = bool(device.get("connected"))

        base_labels = {
            "network_id": network_id,
            "device_id": device_id,
            "name": _label(device.get("display_name")),
            "mac": _label(device.get("mac")),
            "manufacturer": _label(device.get("manufacturer")),
            "device_type": _label(device.get("device_type")),
            "connection_type": _label(device.get("connection_type")),
            "source_eero": _label(device.get("connected_to_eero")),
        }
        samples.append(
            Sample(
                "eero_device_connected",
                1.0 if connected else 0.0,
                now_ms,
                labels=base_labels,
            )
        )

        self._append_device_signal_samples(
            network_id, device_id, device, samples, now_ms
        )

        return connected

    @staticmethod
    def _append_device_signal_samples(
        network_id: str,
        device_id: str,
        device: dict[str, Any],
        samples: list[Sample],
        now_ms: int,
    ) -> None:
        """Append the optional signal-strength and connection-score samples."""
        signal_strength = device.get("signal_strength")
        if signal_strength is not None:
            samples.append(
                Sample(
                    "eero_device_signal_strength_dbm",
                    float(signal_strength),
                    now_ms,
                    labels={
                        "network_id": network_id,
                        "device_id": device_id,
                        "name": _label(device.get("display_name")),
                        "manufacturer": _label(device.get("manufacturer")),
                        "band": _label(device.get("frequency")),
                        "source_eero": _label(device.get("connected_to_eero")),
                    },
                )
            )

        signal_bars = device.get("signal_bars")
        if signal_bars is not None:
            samples.append(
                Sample(
                    "eero_device_connection_score_bars",
                    float(signal_bars),
                    now_ms,
                    labels={
                        "network_id": network_id,
                        "device_id": device_id,
                        "name": _label(device.get("display_name")),
                        "manufacturer": _label(device.get("manufacturer")),
                        "connection_type": _label(device.get("connection_type")),
                        "source_eero": _label(device.get("connected_to_eero")),
                    },
                )
            )

    async def _collect_eeros(
        self, client: EeroClient, network_id: str, samples: list[Sample], now_ms: int
    ) -> bool:
        """Collect eero-node-scoped metrics for one network.

        Returns:
            True on success, False if the underlying fetch failed.
        """
        raw_eeros, ok = await self._safe_fetch(
            client.get_eeros(network_id=network_id), "list eeros"
        )
        if not ok:
            return False

        for raw_eero in extract_list(raw_eeros, "eeros"):
            eero = normalize_eero(raw_eero)
            eero_id = eero.get("id")
            if not eero_id:
                _LOGGER.debug("Skipping eero with no resolvable id")
                continue
            self._collect_eero_samples(network_id, eero_id, eero, samples, now_ms)

        return True

    def _collect_eero_samples(
        self,
        network_id: str,
        eero_id: str,
        eero: dict[str, Any],
        samples: list[Sample],
        now_ms: int,
    ) -> None:
        """Append every per-eero sample for one eero node."""
        mesh_quality_bars = eero.get("mesh_quality_bars")
        if mesh_quality_bars is not None:
            samples.append(
                Sample(
                    "eero_eero_mesh_quality_bars",
                    float(mesh_quality_bars),
                    now_ms,
                    labels={
                        "network_id": network_id,
                        "eero_id": eero_id,
                        "location": _label(eero.get("location")),
                        "model": _label(eero.get("model")),
                    },
                )
            )

        samples.append(
            Sample(
                "eero_eero_client_count",
                float(eero.get("connected_clients_count") or 0),
                now_ms,
                labels={
                    "network_id": network_id,
                    "eero_id": eero_id,
                    "location": _label(eero.get("location")),
                },
            )
        )

        last_reboot = _parse_iso_timestamp_to_epoch_seconds(eero.get("last_reboot"))
        if last_reboot is not None:
            samples.append(
                Sample(
                    "eero_eero_last_reboot_timestamp_seconds",
                    last_reboot,
                    now_ms,
                    labels={"network_id": network_id, "eero_id": eero_id},
                )
            )

    async def _collect_speed_tests(
        self, client: EeroClient, network_id: str, samples: list[Sample], now_ms: int
    ) -> bool:
        """Collect the most recent speed test result for one network.

        Returns:
            True on success (including "no speed tests yet"), False if the
            underlying fetch failed.
        """
        raw_speed_tests, ok = await self._safe_fetch(
            client.get_speed_tests(network_id=network_id, limit=1), "get speed tests"
        )
        if not ok:
            return False

        results = extract_list(raw_speed_tests, "speedtest")
        if not results:
            return True

        latest = (
            normalize_speed_test(results[0]) if isinstance(results[0], dict) else {}
        )
        download_mbps = latest.get("down_mbps")
        upload_mbps = latest.get("up_mbps")

        if download_mbps is not None:
            samples.append(
                Sample(
                    "eero_speed_download_mbps",
                    float(download_mbps),
                    now_ms,
                    labels={"network_id": network_id},
                )
            )
        if upload_mbps is not None:
            samples.append(
                Sample(
                    "eero_speed_upload_mbps",
                    float(upload_mbps),
                    now_ms,
                    labels={"network_id": network_id},
                )
            )
        return True

    async def _collect_dns_mode(
        self, client: EeroClient, network_id: str, samples: list[Sample], now_ms: int
    ) -> bool:
        """Collect the active IPv4 DNS mode for one network.

        See the module docstring for why IPv4's mode is used as "the" mode.

        Returns:
            True on success, False if the underlying fetch failed.
        """
        raw_dns, ok = await self._safe_fetch(
            client.get_dns_settings(network_id=network_id), "get DNS settings"
        )
        if not ok:
            return False

        dns = normalize_dns(extract_data(raw_dns))
        mode = dns.get("ipv4", {}).get("mode")
        if mode:
            samples.append(
                Sample(
                    "eero_network_dns_mode",
                    1.0,
                    now_ms,
                    labels={"network_id": network_id, "mode": _label(mode)},
                )
            )
        return True
