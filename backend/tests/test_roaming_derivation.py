"""Tests for the pure roaming-event derivation in app/services/roaming.py.

See eero-ui#431 WP1. All fixtures build raw VictoriaMetrics matrix series
by hand -- one dict per label-distinct series, mirroring what
``query_range`` would return for ``eero_device_connected``.
"""

from __future__ import annotations

from typing import Any

from app.services.roaming import (
    RANGE_SECONDS,
    Transition,
    choose_step,
    derive_transitions,
    top_roamers,
)


def _series(
    device_id: str,
    values: list[tuple[float, str]],
    source_eero: str = "Living Room",
    **extra_labels: str,
) -> dict[str, Any]:
    """Build one eero_device_connected matrix series.

    Args:
        device_id: The device_id label.
        values: ``(timestamp, value)`` pairs, matching VictoriaMetrics'
            ``[unix_ts_float, "value_string"]`` wire format.
        source_eero: The node label for this series.
        extra_labels: Extra/overriding metric labels (e.g. to simulate a
            rename via ``name=...``).
    """
    metric = {
        "device_id": device_id,
        "name": "Device",
        "mac": "aa:bb:cc:dd:ee:ff",
        "manufacturer": "Acme",
        "device_type": "phone",
        "connection_type": "wireless",
        "network_id": "net-1",
        "source_eero": source_eero,
        **extra_labels,
    }
    return {"metric": metric, "values": [[ts, v] for ts, v in values]}


def _no_device_id_series(values: list[tuple[float, str]]) -> dict[str, Any]:
    """A series missing the device_id label (must be ignored entirely)."""
    return {
        "metric": {"name": "Ghost", "network_id": "net-1"},
        "values": [[ts, v] for ts, v in values],
    }


class TestDeriveTransitionsEdgeCases:
    def test_empty_result_yields_no_transitions(self) -> None:
        assert derive_transitions([]) == []

    def test_single_sample_yields_no_event(self) -> None:
        result = [_series("device-1", [(100.0, "1")])]
        assert derive_transitions(result) == []

    def test_series_without_device_id_is_ignored(self) -> None:
        result = [
            _no_device_id_series([(100.0, "1"), (160.0, "1")]),
            _series("device-1", [(100.0, "1")]),
        ]
        # No crash, and the ghost series contributes no transitions.
        assert derive_transitions(result) == []

    def test_nan_value_is_skipped(self) -> None:
        result = [
            _series("device-1", [(100.0, "1")], source_eero="Living Room"),
            _series("device-1", [(160.0, "NaN")], source_eero="Bedroom"),
            _series("device-1", [(220.0, "1")], source_eero="Bedroom"),
        ]
        transitions = derive_transitions(result)
        # The NaN sample is dropped entirely, so the only real samples are
        # Living Room@100 and Bedroom@220 -- still a single move.
        assert len(transitions) == 1
        assert transitions[0].timestamp == 220.0
        assert transitions[0].previous_seen == 100.0


class TestSimpleMove:
    def test_move_a_to_b(self) -> None:
        result = [
            _series(
                "device-1", [(100.0, "1"), (160.0, "1")], source_eero="Living Room"
            ),
            _series("device-1", [(220.0, "1"), (280.0, "1")], source_eero="Bedroom"),
        ]

        transitions = derive_transitions(result)

        assert len(transitions) == 1
        t = transitions[0]
        assert t.device_id == "device-1"
        assert t.event_type == "move"
        assert t.from_node == "Living Room"
        assert t.to_node == "Bedroom"
        assert t.timestamp == 220.0
        assert t.previous_seen == 160.0


class TestBounce:
    def test_a_to_b_to_a_yields_two_moves_newest_first(self) -> None:
        result = [
            _series(
                "device-1", [(100.0, "1"), (160.0, "1")], source_eero="Living Room"
            ),
            _series("device-1", [(220.0, "1"), (280.0, "1")], source_eero="Bedroom"),
            _series("device-1", [(340.0, "1")], source_eero="Living Room"),
        ]

        transitions = derive_transitions(result)

        assert len(transitions) == 2
        # Newest first.
        assert transitions[0].timestamp == 340.0
        assert transitions[0].from_node == "Bedroom"
        assert transitions[0].to_node == "Living Room"
        assert transitions[0].previous_seen == 280.0

        assert transitions[1].timestamp == 220.0
        assert transitions[1].from_node == "Living Room"
        assert transitions[1].to_node == "Bedroom"
        assert transitions[1].previous_seen == 160.0


class TestDisconnectReconnect:
    def test_disconnect_then_reconnect_to_different_node(self) -> None:
        result = [
            _series(
                "device-1", [(100.0, "1"), (160.0, "1")], source_eero="Living Room"
            ),
            _series("device-1", [(220.0, "0")], source_eero="Living Room"),
            _series("device-1", [(280.0, "1"), (340.0, "1")], source_eero="Bedroom"),
        ]

        transitions = derive_transitions(result)

        assert len(transitions) == 2
        assert all(t.event_type != "move" for t in transitions)

        # Newest first: reconnect, then disconnect.
        reconnect, disconnect = transitions
        assert reconnect.event_type == "reconnect"
        assert reconnect.from_node is None
        assert reconnect.to_node == "Bedroom"
        assert reconnect.timestamp == 280.0
        assert reconnect.previous_seen == 220.0

        assert disconnect.event_type == "disconnect"
        assert disconnect.from_node == "Living Room"
        assert disconnect.to_node is None
        assert disconnect.timestamp == 220.0
        assert disconnect.previous_seen == 160.0


class TestRenameIsNotAnEvent:
    def test_name_label_change_with_same_node_yields_no_event(self) -> None:
        result = [
            _series(
                "device-1",
                [(100.0, "1"), (160.0, "1")],
                source_eero="Living Room",
                name="Phone",
            ),
            _series(
                "device-1",
                [(220.0, "1"), (280.0, "1")],
                source_eero="Living Room",
                name="iPhone",
            ),
        ]

        assert derive_transitions(result) == []


class TestOverlappingSeriesAtLabelChange:
    def test_overlap_at_change_picks_new_state_exactly_once(self) -> None:
        # Both series carry a sample at ts=160.0 -- the instant of the
        # label change. The device was Living-Room-connected up to and
        # including ts=100; from ts=160 onward every real sample is
        # Bedroom. Only one move must be emitted.
        result = [
            _series(
                "device-1", [(100.0, "1"), (160.0, "1")], source_eero="Living Room"
            ),
            _series("device-1", [(160.0, "1"), (220.0, "1")], source_eero="Bedroom"),
        ]

        transitions = derive_transitions(result)

        assert len(transitions) == 1
        t = transitions[0]
        assert t.from_node == "Living Room"
        assert t.to_node == "Bedroom"
        assert t.timestamp == 160.0
        assert t.previous_seen == 100.0


class TestGapBetweenSamples:
    def test_gap_still_yields_single_move_with_previous_seen_at_last_a(self) -> None:
        result = [
            _series("device-1", [(100.0, "1")], source_eero="Living Room"),
            _series("device-1", [(400.0, "1")], source_eero="Bedroom"),
        ]

        transitions = derive_transitions(result)

        assert len(transitions) == 1
        t = transitions[0]
        assert t.from_node == "Living Room"
        assert t.to_node == "Bedroom"
        assert t.timestamp == 400.0
        assert t.previous_seen == 100.0


class TestOfflineNodeLabelIgnored:
    def test_offline_samples_with_differing_source_eero_yield_nothing(self) -> None:
        result = [
            _series("device-1", [(100.0, "0")], source_eero="Living Room"),
            _series("device-1", [(160.0, "0")], source_eero="Bedroom"),
        ]

        assert derive_transitions(result) == []


class TestTwoDevicesInterleaved:
    def test_sorted_newest_first_with_stable_device_id_tiebreak(self) -> None:
        # Both devices move to a new node at the exact same timestamp.
        result = [
            _series("device-a", [(100.0, "1")], source_eero="Living Room"),
            _series("device-a", [(500.0, "1")], source_eero="Bedroom"),
            _series("device-b", [(100.0, "1")], source_eero="Living Room"),
            _series("device-b", [(500.0, "1")], source_eero="Bedroom"),
        ]

        transitions = derive_transitions(result)

        assert len(transitions) == 2
        assert [t.timestamp for t in transitions] == [500.0, 500.0]
        # Stable tiebreak: device-a before device-b at the same timestamp.
        assert [t.device_id for t in transitions] == ["device-a", "device-b"]


class TestTopRoamers:
    @staticmethod
    def _move(device_id: str, ts: float) -> Transition:
        return Transition(
            device_id=device_id,
            event_type="move",
            from_node="A",
            to_node="B",
            timestamp=ts,
            previous_seen=ts - 60,
            latest_labels={},
        )

    @staticmethod
    def _disconnect(device_id: str, ts: float) -> Transition:
        return Transition(
            device_id=device_id,
            event_type="disconnect",
            from_node="A",
            to_node=None,
            timestamp=ts,
            previous_seen=ts - 60,
            latest_labels={},
        )

    def test_ranking_ties_and_disconnects_excluded(self) -> None:
        transitions = [
            *[self._move("device-x", ts) for ts in (100.0, 200.0, 300.0)],
            *[self._move("device-y", ts) for ts in (110.0, 210.0, 310.0)],
            self._move("device-z", 400.0),
            self._disconnect("device-w", 500.0),
            self._disconnect("device-w", 600.0),
        ]

        ranked = top_roamers(transitions)

        assert ranked == [("device-x", 3), ("device-y", 3), ("device-z", 1)]
        assert "device-w" not in dict(ranked)

    def test_limit_is_respected(self) -> None:
        transitions = [
            *[self._move("device-x", ts) for ts in (100.0, 200.0, 300.0)],
            *[self._move("device-y", ts) for ts in (110.0, 210.0, 310.0)],
            self._move("device-z", 400.0),
        ]

        ranked = top_roamers(transitions, limit=2)

        assert ranked == [("device-x", 3), ("device-y", 3)]

    def test_empty_transitions_yield_empty_ranking(self) -> None:
        assert top_roamers([]) == []


class TestChooseStep:
    def test_at_60_second_collection_interval(self) -> None:
        assert choose_step(RANGE_SECONDS["1h"], 60) == 60
        assert choose_step(RANGE_SECONDS["6h"], 60) == 60
        assert choose_step(RANGE_SECONDS["24h"], 60) == 60
        assert choose_step(RANGE_SECONDS["7d"], 60) == 210

    def test_at_10_second_collection_interval(self) -> None:
        assert choose_step(RANGE_SECONDS["1h"], 10) == 10
        assert choose_step(RANGE_SECONDS["6h"], 10) == 10
        assert choose_step(RANGE_SECONDS["24h"], 10) == 30
        assert choose_step(RANGE_SECONDS["7d"], 10) == 210
