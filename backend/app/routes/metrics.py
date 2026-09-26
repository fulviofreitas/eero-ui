"""Metrics routes for querying historical data from VictoriaMetrics."""

import asyncio
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..deps import require_auth, validate_request_path_ids
from ..services.victoria import victoria_client
from ..transformers import InvalidIdentifierError, validate_path_id

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
