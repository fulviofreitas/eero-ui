"""Metrics routes for querying historical data from VictoriaMetrics."""

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
from eero import EeroClient
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict

from ..config import settings
from ..deps import require_auth, validate_request_path_ids
from ..services.roaming import (
    MAX_EVENTS,
    MAX_SERIES,
    RANGE_SECONDS,
    RoamingNode,
    Transition,
    choose_step,
    derive_transitions,
    resolve_node,
    top_roamers,
)
from ..services.victoria import victoria_client
from ..transformers import (
    InvalidIdentifierError,
    extract_list,
    normalize_device,
    normalize_eero,
    normalize_network,
    validate_path_id,
)
from .auth import limiter

router = APIRouter(
    dependencies=[Depends(require_auth), Depends(validate_request_path_ids)]
)
_LOGGER = logging.getLogger(__name__)


def _validate_identifier(value: str, field_name: str) -> str:
    """Validate an identifier before it reaches a PromQL label selector.

    Thin HTTPException(400) wrapper around the shared
    ``transformers.validate_path_id`` (security review, 2026-09-24: moved
    there so routes/networks.py, routes/profiles.py, routes/eeros.py and
    routes/devices.py share one implementation instead of duplicating it).

    Raises HTTPException(400) if the identifier is malformed.
    """
    try:
        return validate_path_id(value)
    except InvalidIdentifierError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        ) from exc


def _network_label_selector(network_id: str | None) -> str:
    """Build a PromQL label selector that scopes a metric to a network.

    Returns an empty string when no network_id is provided so the query
    behaves as before. Raises 400 if the network_id is malformed.
    """
    if not network_id:
        return ""
    validated = _validate_identifier(network_id, "network_id")
    return f'{{network_id="{validated}"}}'


@router.get("/health")
async def metrics_health(request: Request) -> dict[str, Any]:
    """Check health of metrics infrastructure.

    Returns:
        Health status of VictoriaMetrics, plus the collector's own
        self-observability data (last successful write, cumulative error
        counts by reason) so a stalled collector is visible here even if
        every metric series still looks fine.
    """
    vm_healthy = await victoria_client.health()
    collector = getattr(request.app.state, "metrics_collector", None)
    last_successful_write = victoria_client.last_successful_write
    collector_errors_total = collector.error_counts if collector is not None else {}
    return {
        "victoria_metrics": "healthy" if vm_healthy else "unavailable",
        "status": "healthy" if vm_healthy else "degraded",
        "last_successful_write": (
            last_successful_write.isoformat() if last_successful_write else None
        ),
        "collector_errors_total": collector_errors_total,
    }


@router.get("/speedtest/history")
async def get_speedtest_history(
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("5m", description="Query resolution step"),
    network_id: str | None = Query(
        None, description="Scope results to a single network"
    ),
) -> dict[str, Any]:
    """Get speedtest history for charts.

    Returns download and upload speeds over time.

    When ``network_id`` is provided, the underlying PromQL is scoped to that
    network so accounts with multiple networks see only the requested one;
    otherwise series from all networks are returned and the caller is
    responsible for picking the relevant one.

    Args:
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.
        network_id: Optional network ID to filter by.

    Returns:
        Download and upload speed history.
    """
    selector = _network_label_selector(network_id)
    try:
        download = await victoria_client.query_range(
            f"eero_speed_download_mbps{selector}", start, end, step
        )
        upload = await victoria_client.query_range(
            f"eero_speed_upload_mbps{selector}", start, end, step
        )
        return {"download": download, "upload": upload}
    except httpx.RequestError as e:
        _LOGGER.error("VictoriaMetrics connection error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        ) from e


@router.get("/devices/{device_id}/signal")
async def get_device_signal_history(
    device_id: str,
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("1m", description="Query resolution step"),
) -> dict[str, Any]:
    """Get device signal strength history.

    Returns signal strength (dBm) and connection score over time for a device.
    Note: eero-prometheus-exporter doesn't provide bandwidth metrics per device,
    so we show signal quality metrics instead.

    Args:
        device_id: The device ID (MAC address without colons, lowercase).
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Signal strength (dBm) and connection score history.
    """
    validated_device_id = _validate_identifier(device_id, "device_id")
    try:
        # eero-prometheus-exporter uses device_id label (MAC without colons)
        signal_strength = await victoria_client.query_range(
            f'eero_device_signal_strength_dbm{{device_id="{validated_device_id}"}}',
            start,
            end,
            step,
        )
        connection_score = await victoria_client.query_range(
            f'eero_device_connection_score_bars{{device_id="{validated_device_id}"}}',
            start,
            end,
            step,
        )
        return {
            "signal_strength": signal_strength,
            "connection_score": connection_score,
        }
    except httpx.RequestError as e:
        _LOGGER.error("VictoriaMetrics connection error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        ) from e


def _device_connected_query(
    network_id: str | None, connection_type: str | None = None
) -> str:
    """Build a ``count(eero_device_connected{...} == 1)`` PromQL query.

    Both ``total`` and the per-``connection_type`` counts are derived from
    the same ``eero_device_connected`` per-device series, so ``total`` is
    always >= ``wireless + wired`` by construction (eero-ui#413) --
    unlike the previous implementation, which sourced ``total`` from the
    unrelated ``eero_network_clients_count`` network-scoped gauge while
    sourcing ``wireless``/``wired`` from this device-scoped one, letting
    the two disagree whenever their label sets diverged.

    Args:
        network_id: Already-validated network id, or None to query across
            every network.
        connection_type: ``"wireless"`` or ``"wired"`` to scope to that
            bucket, or None for the unscoped total (which also counts
            devices whose connection type could not be determined).

    Returns:
        The PromQL query string.
    """
    filters: list[str] = []
    if connection_type:
        filters.append(f'connection_type="{connection_type}"')
    if network_id:
        filters.append(f'network_id="{network_id}"')
    selector = "{" + ",".join(filters) + "}" if filters else ""
    return f"count(eero_device_connected{selector} == 1)"


@router.get("/network/client_count")
async def get_network_client_count(
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("5m", description="Query resolution step"),
    network_id: str | None = Query(
        None, description="Scope results to a single network"
    ),
) -> dict[str, Any]:
    """Get network client count history.

    Returns the number of connected clients over time, including
    total, wireless, and wired counts. ``total`` and the wireless/wired
    split are all derived from the same ``eero_device_connected`` series
    (see ``_device_connected_query``) so total is always >= wireless +
    wired.

    When ``network_id`` is provided, the underlying PromQL is scoped to
    that network so accounts with multiple networks see only the
    requested one; otherwise series from all networks are aggregated
    together.

    Args:
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.
        network_id: Optional network ID to filter by.

    Returns:
        Client count history (total, wireless, wired).
    """
    validated_network_id = (
        _validate_identifier(network_id, "network_id") if network_id else None
    )
    try:
        total, wireless, wired = await asyncio.gather(
            victoria_client.query_range(
                _device_connected_query(validated_network_id), start, end, step
            ),
            victoria_client.query_range(
                _device_connected_query(validated_network_id, "wireless"),
                start,
                end,
                step,
            ),
            victoria_client.query_range(
                _device_connected_query(validated_network_id, "wired"),
                start,
                end,
                step,
            ),
        )
        return {
            "total": total,
            "wireless": wireless,
            "wired": wired,
            # Keep backwards compatibility
            "client_count": total,
        }
    except httpx.RequestError as e:
        _LOGGER.error("VictoriaMetrics connection error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        ) from e


def _now() -> int:
    """Current time, in whole Unix epoch seconds.

    A thin wrapper around ``time.time()`` so tests can patch
    ``app.routes.metrics._now`` for a deterministic ``end``/``start``
    window instead of mocking the stdlib clock (eero-ui#431 WP2).
    """
    return int(time.time())


def _iso_z(timestamp: float) -> str:
    """Render a Unix timestamp as UTC ISO-8601 with a literal ``Z`` suffix.

    Matches the format the frontend was built against (e.g.
    ``"2026-10-06T11:58:00Z"``) rather than pydantic/stdlib's default
    ``+00:00`` offset suffix.
    """
    return (
        datetime.fromtimestamp(timestamp, tz=UTC)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


class RoamingEvent(BaseModel):
    """A single derived roaming transition for the roaming events timeline."""

    timestamp: str
    previous_seen: str
    device_id: str
    device_name: str
    mac: str | None
    event_type: Literal["move", "disconnect", "reconnect"]
    from_node: RoamingNode | None
    to_node: RoamingNode | None

    model_config = ConfigDict(extra="forbid")


class RoamingTopRoamer(BaseModel):
    """A device ranked by number of node-to-node moves in the window."""

    device_id: str
    device_name: str
    moves: int

    model_config = ConfigDict(extra="forbid")


class RoamingResponse(BaseModel):
    """Response for ``GET /api/metrics/roaming``."""

    network_id: str
    range: str
    start: int
    end: int
    resolution_seconds: int
    total_events: int
    truncated: bool
    events: list[RoamingEvent]
    top_roamers: list[RoamingTopRoamer]

    model_config = ConfigDict(extra="forbid")


def _device_mac(
    device_id: str,
    labels: dict[str, str],
    device_by_id: dict[str, dict[str, Any]],
) -> str | None:
    """Resolve a device's MAC: current device record, then the VM label."""
    device = device_by_id.get(device_id)
    if device and device.get("mac"):
        return device["mac"]
    return labels.get("mac") or None


def _device_name(
    device_id: str,
    labels: dict[str, str],
    device_by_id: dict[str, dict[str, Any]],
) -> str:
    """Resolve a device's display name.

    Order: current device's normalized ``display_name`` (nickname ->
    hostname, per ``normalize_device``), then the series' latest ``name``
    label, then its MAC, then the bare ``device_id``.
    """
    device = device_by_id.get(device_id)
    if device and device.get("display_name"):
        return device["display_name"]
    if labels.get("name"):
        return labels["name"]
    mac = _device_mac(device_id, labels, device_by_id)
    if mac:
        return mac
    return device_id


async def _resolve_roaming_entities(
    client: EeroClient, network_id: str
) -> tuple[dict[str, dict[str, Any]], dict[str, str | None]]:
    """Best-effort resolution of current device/eero names for roaming events.

    Everything here -- the SDK calls themselves, and the normalization of
    whatever they return -- lives inside one try/except: a malformed
    payload (e.g. a devices list containing a non-dict entry) must fall
    back exactly like a transport failure, not crash the route (eero-ui#431
    follow-up).

    Returns:
        ``(device_by_id, node_id_by_location)``. Both are empty dicts if
        resolution fails for any reason -- name resolution must never fail
        the route; callers fall back to VictoriaMetrics labels.
        ``node_id_by_location`` maps a normalized location to the eero id
        at that location, or to ``None`` when more than one current eero
        shares the same location string (ambiguous -- the label alone
        can't tell them apart; see the module docstring in
        ``services/roaming.py``).
    """
    try:
        devices_raw, eeros_raw = await asyncio.gather(
            client.get_devices(network_id=network_id),
            client.get_eeros(network_id=network_id),
        )
        devices = [normalize_device(d) for d in extract_list(devices_raw, "devices")]
        eeros = [normalize_eero(e) for e in extract_list(eeros_raw, "eeros")]

        device_by_id = {d["id"]: d for d in devices if d.get("id")}

        ids_by_location: dict[str, list[str | None]] = {}
        for eero in eeros:
            location = eero.get("location")
            if not location:
                continue
            ids_by_location.setdefault(location, []).append(eero.get("id"))

        node_id_by_location: dict[str, str | None] = {
            location: (ids[0] if len(ids) == 1 else None)
            for location, ids in ids_by_location.items()
        }
        return device_by_id, node_id_by_location
    except Exception as exc:  # name resolution is best-effort only
        _LOGGER.warning(
            "Failed to resolve device/eero names for roaming events on network "
            "%s: %s",
            network_id,
            exc,
        )
        return {}, {}


async def _verify_network_ownership(client: EeroClient, network_id: str) -> None:
    """Verify ``network_id`` belongs to the authenticated account.

    Lists the account's networks the same way ``routes/networks.py``'s
    ``list_networks`` does (``extract_list`` + ``normalize_network``) and
    checks ``network_id`` is one of them, before any VictoriaMetrics query
    is scoped to it.

    Any SDK exception from ``get_networks`` is deliberately left
    unhandled here: it propagates to the same global exception handlers
    registered in ``main.py`` (phase-6.0-revamp.md § 3.4) that every other
    route in this family relies on -- e.g. an expired session still 401s --
    rather than being mapped a second time in this function.

    Raises:
        HTTPException: 404 if ``network_id`` is not one of the account's
            networks.
    """
    raw_response = await client.get_networks()
    networks = extract_list(raw_response, "networks")
    network_ids = {normalize_network(n).get("id") for n in networks}
    if network_id not in network_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )


def _require_vm_data(response: Any) -> dict[str, Any]:
    """Validate a VictoriaMetrics response envelope and return its ``data``.

    Shared by the instant pre-flight count query and the range query --
    both must be a ``{"status": "success", "data": {...}}`` envelope.

    Raises:
        HTTPException: 503 if the response is not a successful,
            well-formed envelope.
    """
    if not isinstance(response, dict) or response.get("status") != "success":
        _LOGGER.error(
            "VictoriaMetrics returned a non-success status for a roaming query"
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )
    data = response.get("data")
    if not isinstance(data, dict):
        _LOGGER.error("VictoriaMetrics returned a malformed roaming query result")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )
    return data


def _parse_instant_count(response: Any) -> int:
    """Parse the scalar count out of a ``count(count_over_time(...))`` query.

    Returns:
        0 if the query matched no series (an empty vector result) -- this
        is the normal "nothing to report" case, not a failure.

    Raises:
        HTTPException: 503 if the response is malformed beyond simply
            matching no series.
    """
    data = _require_vm_data(response)
    result = data.get("result")
    if not isinstance(result, list):
        _LOGGER.error("VictoriaMetrics returned a malformed instant query result")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )
    if not result:
        return 0

    entry = result[0]
    value = entry.get("value") if isinstance(entry, dict) else None
    if not isinstance(value, list) or len(value) != 2:
        _LOGGER.error("VictoriaMetrics returned a malformed instant query result")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )
    try:
        return int(float(value[1]))
    except (TypeError, ValueError) as exc:
        _LOGGER.error(
            "VictoriaMetrics instant query returned a non-numeric count: %s", exc
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        ) from exc


def _build_roaming_event(
    transition: Transition,
    device_by_id: dict[str, dict[str, Any]],
    node_id_by_location: dict[str, str | None],
) -> RoamingEvent:
    """Build one ``RoamingEvent`` from a derived ``Transition``."""
    return RoamingEvent(
        timestamp=_iso_z(transition.timestamp),
        previous_seen=_iso_z(transition.previous_seen),
        device_id=transition.device_id,
        device_name=_device_name(
            transition.device_id, transition.latest_labels, device_by_id
        ),
        mac=_device_mac(transition.device_id, transition.latest_labels, device_by_id),
        event_type=transition.event_type,
        from_node=resolve_node(transition.from_node, node_id_by_location),
        to_node=resolve_node(transition.to_node, node_id_by_location),
    )


@router.get("/roaming", response_model=RoamingResponse)
@limiter.shared_limit("30/minute", scope="metrics_history")
async def get_roaming_events(
    request: Request,
    network_id: str = Query(..., description="Network to query roaming events for"),
    range: str = Query(  # shadows the builtin to match the query param name
        "24h", description="Time window: one of 1h, 6h, 24h, 7d"
    ),
    device_id: str | None = Query(None, description="Scope results to a single device"),
    client: EeroClient = Depends(require_auth),
) -> RoamingResponse:
    """Derive roaming (device-to-node) events from ``eero_device_connected``.

    Reads the raw connectivity history, derives move/disconnect/reconnect
    events (``services/roaming.py``), caps the response at
    ``MAX_EVENTS``/``MAX_SERIES`` and resolves device/node names against
    the current device and eero lists on a best-effort basis (eero-ui#431
    WP2).

    Args:
        network_id: The network to query. Validated before it ever reaches
            a PromQL label selector.
        range: One of ``RANGE_SECONDS``' keys (``1h``, ``6h``, ``24h``,
            ``7d``). Any other value is a 400, not FastAPI's default
            422-with-enum-list -- this route's 422 is reserved for the
            too-many-series cap below.
        device_id: Optional single-device filter, validated the same way
            as ``network_id``.
        client: The authenticated SDK client, used only for best-effort
            name resolution.

    Returns:
        The derived roaming timeline plus the top-roamers leaderboard.

    Raises:
        HTTPException: 400 for a malformed ``network_id``/``device_id`` or
            an unrecognised ``range``; 404 if ``network_id`` is not one of
            the authenticated account's networks; 422 if the query matches
            more than ``MAX_SERIES`` device series; 503 if VictoriaMetrics
            is unreachable or returns a non-success/malformed response.
    """
    validated_network_id = _validate_identifier(network_id, "network_id")
    validated_device_id = (
        _validate_identifier(device_id, "device_id") if device_id else None
    )

    if range not in RANGE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid range",
        )

    await _verify_network_ownership(client, validated_network_id)

    range_seconds = RANGE_SECONDS[range]
    step = choose_step(range_seconds, settings.collection_interval)
    end = _now()
    start = end - range_seconds

    filters = [f'network_id="{validated_network_id}"']
    if validated_device_id:
        filters.append(f'device_id="{validated_device_id}"')
    selector = "{" + ",".join(filters) + "}"
    promql = f"last_over_time(eero_device_connected{selector}[{step}s])"
    count_promql = (
        f"count(count_over_time(eero_device_connected{selector}[{range_seconds}s]))"
    )

    # Bound the work below the range query actually does: an instant query
    # is far cheaper than a full range query, so check how many device
    # series would match before running (or skipping) the heavier one.
    try:
        count_response = await victoria_client.query(count_promql, time=str(end))
    except (httpx.HTTPError, ValueError) as e:
        _LOGGER.error("VictoriaMetrics connection error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        ) from e

    series_count = _parse_instant_count(count_response)

    if series_count > MAX_SERIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Too many device series in this range; narrow the range or "
                "filter a device"
            ),
        )

    if series_count == 0:
        result: list[dict[str, Any]] = []
    else:
        try:
            response = await victoria_client.query_range(
                promql, str(start), str(end), f"{step}s"
            )
        except (httpx.HTTPError, ValueError) as e:
            _LOGGER.error("VictoriaMetrics connection error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Metrics service unavailable",
            ) from e

        data = _require_vm_data(response)
        result = data.get("result")
        if not isinstance(result, list):
            _LOGGER.error("VictoriaMetrics returned a malformed roaming query result")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Metrics service unavailable",
            )

        # Backstop: the instant pre-count above is a separate query against
        # the same selector and could in principle disagree with the range
        # query's actual series count (e.g. series appearing/disappearing
        # between the two calls).
        if len(result) > MAX_SERIES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Too many device series in this range; narrow the range or "
                    "filter a device"
                ),
            )

    transitions = derive_transitions(result)
    total_events = len(transitions)
    truncated = total_events > MAX_EVENTS
    limited_transitions = transitions[:MAX_EVENTS]
    roamer_counts = top_roamers(transitions)

    if transitions or roamer_counts:
        device_by_id, node_id_by_location = await _resolve_roaming_entities(
            client, validated_network_id
        )
    else:
        device_by_id, node_id_by_location = {}, {}

    latest_labels_by_device: dict[str, dict[str, str]] = {}
    for transition in transitions:
        latest_labels_by_device.setdefault(
            transition.device_id, transition.latest_labels
        )

    events = [
        _build_roaming_event(transition, device_by_id, node_id_by_location)
        for transition in limited_transitions
    ]

    top_roamers_response = [
        RoamingTopRoamer(
            device_id=roamer_device_id,
            device_name=_device_name(
                roamer_device_id,
                latest_labels_by_device.get(roamer_device_id, {}),
                device_by_id,
            ),
            moves=moves,
        )
        for roamer_device_id, moves in roamer_counts
    ]

    return RoamingResponse(
        network_id=validated_network_id,
        range=range,
        start=start,
        end=end,
        resolution_seconds=step,
        total_events=total_events,
        truncated=truncated,
        events=events,
        top_roamers=top_roamers_response,
    )
