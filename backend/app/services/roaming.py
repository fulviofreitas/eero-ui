"""Derivation of device roaming transitions from ``eero_device_connected`` history.

Pure, I/O-free functions: this module takes the raw VictoriaMetrics matrix
response (``data.result`` from ``query_range`` against
``eero_device_connected``, see ``services/victoria.py``) and derives
roaming events for the route layer (eero-ui#431 WP2).

Design constraints that drive the shape of this code:

- Grouping is by ``device_id`` ONLY. Every other label on
  ``eero_device_connected`` (``name``, ``mac``, ``connection_type``, ...)
  starts a brand new VictoriaMetrics series the moment it changes (see
  ``wiki/Metrics.md``), so a device rename must never be mistaken for a
  roaming event. Only ``source_eero`` (the connected node) and the sample
  value (connected/offline) participate in event derivation.
- A missing timestamp is a gap, not an offline observation -- state only
  ever changes on an observed sample (collector.py writes ``0`` for a
  known-but-offline device, so "offline" is itself an observed state, just
  never inferred from absence).
- Right around a label change, two series for the same device can both
  carry a sample at the same timestamp (both had a sample inside the
  query_range step window). When that happens, the state that differs
  from the device's previous known state wins -- that is the actual
  change. If there is no previous state, or several candidate states all
  differ, fall back to a deterministic order: connected before offline,
  then by node name.
- A ``CONNECTED`` sample with an empty ``source_eero`` label means
  "connected, but which node is unknown" -- not "connected to a node
  named ''". While the device was already connected, such a sample must
  not create a move or reset the carried node: the last known node is
  carried forward and no event is emitted. Only when the device was
  previously offline (or this is the very first sample) does a blank
  label still produce a genuine reconnect, to an unresolved node (see
  ``resolve_node``).

Known resolution limits (eero-ui#431 follow-up, documented rather than
silently accepted):

- Two hops that land inside the same ``step`` window are indistinguishable
  from a single hop. ``_collapse_timestamps``' tiebreak can only impose a
  deterministic *order* on same-timestamp samples (connected before
  offline, then by node name) -- it has no way to recover which sample was
  actually observed first, so an A -> B -> A bounce entirely inside one
  step can collapse into zero or one transition instead of two.
- A move between two eeros that share the same ``location`` string is
  invisible to this module: ``source_eero`` IS the location string, so two
  nodes with identical locations produce identical ``DeviceState.node``
  values and nothing here can tell them apart. ``routes/metrics.py``'s
  ``_resolve_roaming_entities`` reflects the same ambiguity one layer up --
  it resolves a shared location to ``eero_id=None`` rather than guessing
  which of the two nodes a transition actually involved.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

MAX_EVENTS = 500
MAX_SERIES = 2000
MAX_POINTS_PER_SERIES = 2880
TOP_ROAMERS_LIMIT = 5

RANGE_SECONDS: dict[str, int] = {
    "1h": 3600,
    "6h": 21600,
    "24h": 86400,
    "7d": 604800,
}


def choose_step(range_seconds: int, collection_interval: int) -> int:
    """Pick a ``query_range`` step that keeps each series under the point cap.

    Args:
        range_seconds: Width of the requested time window, in seconds.
        collection_interval: The collector's sampling interval, in
            seconds. The step is never finer than this -- no more real
            samples than that exist regardless of the step requested.

    Returns:
        The step, in seconds: ``collection_interval``, or just wide enough
        to keep ``range_seconds / step <= MAX_POINTS_PER_SERIES``,
        whichever is larger.
    """
    min_step_for_cap = math.ceil(range_seconds / MAX_POINTS_PER_SERIES)
    return max(collection_interval, min_step_for_cap)


@dataclass(frozen=True)
class DeviceState:
    """A device's connectivity state at a single observed instant.

    Attributes:
        connected: Whether the device was connected at this instant.
        node: The ``source_eero`` label, meaningful only when
            ``connected`` is ``True``. An offline device has no current
            node, so this is always ``""`` when ``connected`` is
            ``False`` -- callers must normalize it that way before
            comparing states, otherwise two offline samples that merely
            carry different stale ``source_eero`` labels would look like
            a change.
    """

    connected: bool
    node: str = ""


@dataclass(frozen=True)
class Transition:
    """A single roaming event derived from two consecutive observed states.

    Attributes:
        device_id: The device this event belongs to.
        event_type: ``"move"`` (connected node changed), ``"disconnect"``
            (connected -> offline), or ``"reconnect"`` (offline ->
            connected).
        from_node: The node before the change, or ``None`` for a
            reconnect (there was no node -- the device was offline).
        to_node: The node after the change, or ``None`` for a disconnect.
        timestamp: The first timestamp at which the new state was
            observed. The true change happened sometime in the interval
            ``(previous_seen, timestamp]``.
        previous_seen: The last timestamp at which the old state was
            observed.
        latest_labels: The full label set of the series that produced
            ``timestamp``'s sample, so callers can fall back to
            ``name``/``mac`` for display even though those labels play no
            part in event derivation.
    """

    device_id: str
    event_type: Literal["move", "disconnect", "reconnect"]
    from_node: str | None
    to_node: str | None
    timestamp: float
    previous_seen: float
    latest_labels: dict[str, str]


@dataclass(frozen=True)
class _Sample:
    """One decoded (timestamp, state, labels) point for a single series."""

    timestamp: float
    state: DeviceState
    labels: dict[str, str]


def _parse_value(raw: Any) -> float | None:
    """Parse a VictoriaMetrics sample value, skipping NaN/unparseable values."""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN never equals itself.
        return None
    return value


def _state_sort_key(state: DeviceState) -> tuple[int, str]:
    """Deterministic tiebreak order: connected before offline, then node name."""
    return (0 if state.connected else 1, state.node)


def _decode_series(series: dict[str, Any]) -> tuple[str, list[_Sample]] | None:
    """Decode one matrix series into its device_id and parsed samples.

    Returns:
        ``(device_id, samples)``, or ``None`` if the series carries no
        ``device_id`` label.
    """
    metric = series.get("metric", {})
    device_id = metric.get("device_id")
    if not device_id:
        return None

    node_label = metric.get("source_eero") or ""
    samples: list[_Sample] = []
    for point in series.get("values", []):
        timestamp, raw_value = point[0], point[1]
        value = _parse_value(raw_value)
        if value is None:
            continue
        connected = value >= 0.5
        state = DeviceState(connected=connected, node=node_label if connected else "")
        samples.append(
            _Sample(timestamp=float(timestamp), state=state, labels=dict(metric))
        )
    return device_id, samples


def _group_samples_by_device(
    result: list[dict[str, Any]],
) -> dict[str, list[_Sample]]:
    """Flatten every series' samples into per-device sample lists.

    Series without a ``device_id`` label are dropped. Samples from
    multiple overlapping series for the same device are merged into one
    list, unsorted and uncollapsed -- see ``_collapse_timestamps``.
    """
    by_device: dict[str, list[_Sample]] = {}
    for series in result:
        decoded = _decode_series(series)
        if decoded is None:
            continue
        device_id, samples = decoded
        by_device.setdefault(device_id, []).extend(samples)
    return by_device


def _collapse_timestamps(samples: list[_Sample]) -> list[_Sample]:
    """Collapse same-timestamp samples for one device into one each.

    When several series give a different state at the same timestamp
    (typical right around a label change), prefer the state that differs
    from the previous (already-collapsed) state; fall back to the
    deterministic sort key when there is no previous state, or when
    several candidates all differ from it.
    """
    by_timestamp: dict[float, list[_Sample]] = {}
    for sample in samples:
        by_timestamp.setdefault(sample.timestamp, []).append(sample)

    collapsed: list[_Sample] = []
    previous_state: DeviceState | None = None
    for timestamp in sorted(by_timestamp):
        candidates = by_timestamp[timestamp]
        if len(candidates) == 1:
            chosen = candidates[0]
        else:
            differing = [
                c
                for c in candidates
                if previous_state is None or c.state != previous_state
            ]
            pool = differing if differing else candidates
            chosen = min(pool, key=lambda c: _state_sort_key(c.state))
        collapsed.append(chosen)
        previous_state = chosen.state
    return collapsed


def _emit_transitions(device_id: str, samples: list[_Sample]) -> list[Transition]:
    """Walk one device's collapsed, time-ordered samples and emit transitions."""
    collapsed = _collapse_timestamps(samples)
    transitions: list[Transition] = []
    previous: _Sample | None = None

    for sample in collapsed:
        state = sample.state

        if (
            state.connected
            and not state.node
            and previous is not None
            and previous.state.connected
        ):
            # "Connected, node unknown" while already connected: carry the
            # last known node forward rather than treating the blank label
            # as a move to node "" (see module docstring). Advance
            # ``previous`` to this later timestamp so a subsequent real
            # transition's ``previous_seen`` reflects this observation,
            # but keep its node -- no event is emitted for this sample.
            previous = _Sample(
                timestamp=sample.timestamp,
                state=previous.state,
                labels=sample.labels,
            )
            continue

        if previous is not None and state != previous.state:
            if previous.state.connected and state.connected:
                event_type: Literal["move", "disconnect", "reconnect"] = "move"
                from_node: str | None = previous.state.node
                to_node: str | None = state.node
            elif previous.state.connected and not state.connected:
                event_type = "disconnect"
                from_node, to_node = previous.state.node, None
            else:
                event_type = "reconnect"
                from_node, to_node = None, state.node

            transitions.append(
                Transition(
                    device_id=device_id,
                    event_type=event_type,
                    from_node=from_node,
                    to_node=to_node,
                    timestamp=sample.timestamp,
                    previous_seen=previous.timestamp,
                    latest_labels=sample.labels,
                )
            )
        previous = sample

    return transitions


def derive_transitions(result: list[dict[str, Any]]) -> list[Transition]:
    """Derive all roaming transitions from a ``query_range`` matrix result.

    Args:
        result: ``data.result`` from a VictoriaMetrics matrix response for
            ``eero_device_connected``, one entry per label-distinct
            series.

    Returns:
        All transitions across all devices, sorted newest-first
        (``timestamp`` desc, then ``device_id`` asc for a stable order).
    """
    by_device = _group_samples_by_device(result)

    transitions: list[Transition] = []
    for device_id, samples in by_device.items():
        transitions.extend(_emit_transitions(device_id, samples))

    transitions.sort(key=lambda t: (-t.timestamp, t.device_id))
    return transitions


def top_roamers(
    transitions: list[Transition], limit: int = TOP_ROAMERS_LIMIT
) -> list[tuple[str, int]]:
    """Rank devices by number of ``"move"`` events.

    Disconnects and reconnects do not count -- only an actual node-to-node
    move does.

    Args:
        transitions: Transitions as returned by ``derive_transitions``.
        limit: Maximum number of devices to return.

    Returns:
        ``(device_id, move_count)`` pairs, ordered by count descending
        then ``device_id`` ascending, limited to ``limit``. Devices with
        zero moves are excluded.
    """
    counts: dict[str, int] = {}
    for transition in transitions:
        if transition.event_type == "move":
            counts[transition.device_id] = counts.get(transition.device_id, 0) + 1

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ranked[:limit]


class RoamingNode(BaseModel):
    """A node (eero) referenced by a roaming event's ``from``/``to`` side.

    Deliberately defined here rather than in ``routes/metrics.py``: this
    model's ``eero_id`` field name is part of the frontend's API contract
    (WP1), but ``test_collector.py``'s ``TestMetricContractAllowlist``
    greps ``routes/metrics.py`` for every bare ``eero_[a-z_]+`` token and
    asserts it is one of a fixed, reviewed set of VictoriaMetrics metric
    names -- ``eero_id`` would trip that guard despite being an identifier
    field, not a metric name. Keeping this model (and anything that
    constructs it) out of ``routes/metrics.py`` avoids a false positive
    without weakening the guard.
    """

    name: str
    eero_id: str | None

    model_config = ConfigDict(extra="forbid")


def resolve_node(
    label: str | None, node_id_by_location: dict[str, str | None]
) -> RoamingNode | None:
    """Build a ``RoamingNode`` from a ``source_eero`` label, or ``None``.

    Args:
        label: A transition's ``from_node``/``to_node`` string -- ``None``
            means "no node" (the device was offline on that side of the
            transition), an empty string means "connected to an unknown
            node" (no ``source_eero`` label observed).
        node_id_by_location: Current eeros' ids keyed by their normalized
            ``location``, so a node still on the network resolves to its
            id; a node that disappeared, or whose location string is
            shared by more than one current eero, resolves to
            ``eero_id=None`` with the label as its name.

    Returns:
        A ``RoamingNode``, or ``None`` if ``label`` is ``None``.
    """
    if label is None:
        return None
    if not label:
        return RoamingNode(name="Unknown node", eero_id=None)
    return RoamingNode(name=label, eero_id=node_id_by_location.get(label))
