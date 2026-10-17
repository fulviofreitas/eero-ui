"""Tests for app.main.lifespan: startup/shutdown ordering.

Covers the coordinator's reviewer finding (2026-09-24): nothing exercised
``lifespan``'s shutdown sequence before this file existed. Drives
``lifespan(app)`` directly as an async context manager, with a fake
``MetricsCollector`` whose ``run_forever`` awaits forever (so there is a
real, live task to cancel) and patched ``shutdown_client`` /
``victoria_client.aclose``, to prove:

1. the collector task is created and actually running after startup;
2. on exit, the task is cancelled and awaited *before* ``shutdown_client``
   and ``victoria_client.aclose`` (call order recorded, not just "all
   three happened");
3. a ``CancelledError`` from the collector task never escapes ``lifespan``;
4. the legacy exporter-session cleanup runs exactly once.
"""

import asyncio
from types import SimpleNamespace

import pytest

from app import main as main_module


class FakeCollector:
    """Stands in for MetricsCollector: run_forever() awaits forever until
    cancelled, so there is a genuinely live task for lifespan to cancel."""

    def __init__(self, *args, **kwargs):
        self.started = asyncio.Event()
        self.cancelled = False
        self.call_order: list[str] | None = None  # injected by the test

    async def run_forever(self):
        self.started.set()
        try:
            await asyncio.Future()  # never resolves on its own
        except asyncio.CancelledError:
            self.cancelled = True
            if self.call_order is not None:
                self.call_order.append("collector_task_cancelled")
            raise


class TestLifespanStartup:
    """(a) the collector task is created on startup."""

    async def test_collector_task_is_created_and_running(self, monkeypatch):
        fake_collector = FakeCollector()
        monkeypatch.setattr(
            main_module, "MetricsCollector", lambda *a, **k: fake_collector
        )
        monkeypatch.setattr(
            main_module, "_remove_legacy_exporter_session_file", lambda: None
        )
        monkeypatch.setattr(main_module, "shutdown_client", _noop_async)
        monkeypatch.setattr(main_module.victoria_client, "aclose", _noop_async)

        async with main_module.lifespan(main_module.app):
            # The task must have actually started running its coroutine,
            # not merely been scheduled -- wait for run_forever's own
            # "I have started" signal rather than asserting on task state.
            await asyncio.wait_for(fake_collector.started.wait(), timeout=1.0)
            assert main_module.app.state.metrics_collector is fake_collector


async def _noop_async(*args, **kwargs) -> None:
    """A do-nothing async replacement for shutdown_client/aclose in tests
    that don't care about call ordering."""
    return


@pytest.mark.parametrize("body_fails", [False, True])
async def test_mqtt_closes_after_collection_and_before_shared_clients(
    monkeypatch, tmp_path, body_fails
):
    """Verify orderly MQTT shutdown on both normal and exceptional lifespan exits."""
    events = []
    collector = FakeCollector()
    collector.call_order = events
    mqtt_path = tmp_path / "custom-mqtt.json"
    monkeypatch.setattr(main_module.settings, "mqtt_file", str(mqtt_path))

    async def close_mqtt():
        """Record when the fake publisher closes for shutdown-order assertions."""
        events.append("mqtt_closed")

    service = SimpleNamespace(
        start=lambda: events.append("mqtt_started"),
        publish_samples=lambda samples: None,
        config=SimpleNamespace(enabled=True),
        close=close_mqtt,
    )

    def make_mqtt(path, interval):
        """Validate the configured settings path and collection interval before returning MQTT."""
        assert path == mqtt_path
        assert interval == main_module.settings.collection_interval
        return service

    def make_collector(*args, **kwargs):
        """Verify the collector receives the publisher and the live WAN enablement callback."""
        assert kwargs["publish_samples"] is service.publish_samples
        assert kwargs["wan_enabled"]()
        return collector

    async def close_client():
        """Record closure of the shared API client after MQTT shuts down."""
        events.append("client_closed")

    monkeypatch.setattr(main_module, "MQTTService", make_mqtt)
    monkeypatch.setattr(main_module, "MetricsCollector", make_collector)
    monkeypatch.setattr(main_module, "shutdown_client", close_client)
    monkeypatch.setattr(main_module.victoria_client, "aclose", _noop_async)

    async def run_lifespan():
        """Start collection and optionally interrupt the running application lifespan."""
        async with main_module.lifespan(main_module.app):
            await asyncio.wait_for(collector.started.wait(), timeout=1)
            assert main_module.app.state.mqtt_service is service
            if body_fails:
                raise RuntimeError("lifespan interrupted")

    if body_fails:
        with pytest.raises(RuntimeError, match="lifespan interrupted"):
            await run_lifespan()
    else:
        await run_lifespan()
    assert events == [
        "mqtt_started",
        "collector_task_cancelled",
        "mqtt_closed",
        "client_closed",
    ]
    assert main_module.app.state.mqtt_service is None


async def test_invalid_mqtt_settings_allow_normal_collection(monkeypatch, caplog):
    """Verify invalid broker settings disable MQTT without stopping normal collection."""
    collector = FakeCollector()

    def invalid_settings(*args):
        """Simulate a settings failure containing a secret that must never reach logs."""
        raise ValueError("private-password")

    def make_collector(*args, **kwargs):
        """Verify collection starts without a publisher and with live WAN reporting disabled."""
        assert kwargs["publish_samples"] is None
        assert not kwargs["wan_enabled"]()
        return collector

    monkeypatch.setattr(main_module, "MQTTService", invalid_settings)
    monkeypatch.setattr(main_module, "MetricsCollector", make_collector)
    monkeypatch.setattr(main_module, "shutdown_client", _noop_async)
    monkeypatch.setattr(main_module.victoria_client, "aclose", _noop_async)
    async with main_module.lifespan(main_module.app):
        await asyncio.wait_for(collector.started.wait(), timeout=1)
        assert main_module.app.state.mqtt_service is None
    assert collector.cancelled
    assert "MQTT settings could not be loaded" in caplog.text
    assert "private-password" not in caplog.text


class TestLifespanShutdownOrdering:
    """(b) cancellation+await happens before shutdown_client and before
    victoria_client.aclose; (c) CancelledError never escapes lifespan;
    (d) the legacy cleanup runs exactly once."""

    async def test_shutdown_order_and_cleanup(self, monkeypatch):
        call_order: list[str] = []
        cleanup_calls: list[int] = []

        fake_collector = FakeCollector()
        fake_collector.call_order = call_order

        async def fake_shutdown_client() -> None:
            call_order.append("shutdown_client")

        async def fake_victoria_aclose() -> None:
            call_order.append("victoria_aclose")

        def fake_cleanup() -> None:
            cleanup_calls.append(1)

        monkeypatch.setattr(
            main_module, "MetricsCollector", lambda *a, **k: fake_collector
        )
        monkeypatch.setattr(
            main_module, "_remove_legacy_exporter_session_file", fake_cleanup
        )
        monkeypatch.setattr(main_module, "shutdown_client", fake_shutdown_client)
        monkeypatch.setattr(main_module.victoria_client, "aclose", fake_victoria_aclose)

        # (c) The CancelledError raised inside run_forever, and re-raised
        # after setting `self.cancelled`, must not propagate out of the
        # `async with` block -- lifespan's own `except asyncio.CancelledError:
        # pass` around `await collector_task` must swallow it.
        async with main_module.lifespan(main_module.app):
            await asyncio.wait_for(fake_collector.started.wait(), timeout=1.0)
        # Reaching here at all proves (c): no exception escaped __aexit__.

        # (a)/(b): the task was actually cancelled, and in the right order.
        assert fake_collector.cancelled is True
        assert call_order == [
            "collector_task_cancelled",
            "shutdown_client",
            "victoria_aclose",
        ]

        # (d): the one-shot legacy cleanup ran exactly once (at startup).
        assert cleanup_calls == [1]


class TestLifespanCleanupRunsBeforeYield:
    """The legacy exporter-session cleanup is a startup action, not a
    shutdown one -- it must have already run by the time the app is
    considered "up" (before the `yield`), independent of shutdown ordering."""

    async def test_cleanup_runs_before_startup_completes(self, monkeypatch):
        cleanup_calls: list[int] = []
        fake_collector = FakeCollector()

        def fake_cleanup() -> None:
            cleanup_calls.append(1)

        monkeypatch.setattr(
            main_module, "MetricsCollector", lambda *a, **k: fake_collector
        )
        monkeypatch.setattr(
            main_module, "_remove_legacy_exporter_session_file", fake_cleanup
        )
        monkeypatch.setattr(main_module, "shutdown_client", _noop_async)
        monkeypatch.setattr(main_module.victoria_client, "aclose", _noop_async)

        async with main_module.lifespan(main_module.app):
            # Cleanup must already have happened by the time we are
            # "inside" the running application, before any shutdown code
            # has had a chance to run.
            assert cleanup_calls == [1]
