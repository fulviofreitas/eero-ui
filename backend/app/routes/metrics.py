"""Metrics routes for querying historical data from VictoriaMetrics."""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from ..services.victoria import victoria_client

router = APIRouter()
_LOGGER = logging.getLogger(__name__)


@router.get("/health")
async def metrics_health() -> dict[str, Any]:
    """Check health of metrics infrastructure.

    Returns:
        Health status of VictoriaMetrics.
    """
    vm_healthy = await victoria_client.health()
    return {
        "victoria_metrics": "healthy" if vm_healthy else "unavailable",
        "status": "healthy" if vm_healthy else "degraded",
    }


@router.get("/query")
async def query_metrics(
    query: str = Query(..., description="PromQL query"),
    time: str | None = Query(None, description="Evaluation time (RFC3339 or Unix)"),
) -> dict[str, Any]:
    """Execute an instant PromQL query.

    Args:
        query: The PromQL query string.
        time: Optional evaluation timestamp.

    Returns:
        Query result from VictoriaMetrics.
    """
    try:
        return await victoria_client.query(query, time)
    except httpx.HTTPStatusError as e:
        _LOGGER.warning(f"VictoriaMetrics query error: {e}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Query failed: {e.response.text}",
        )
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


@router.get("/query_range")
async def query_range(
    query: str = Query(..., description="PromQL query"),
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("1m", description="Query resolution step (e.g., 1m, 5m, 1h)"),
) -> dict[str, Any]:
    """Execute a range PromQL query for historical data.

    Args:
        query: The PromQL query string.
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Query result from VictoriaMetrics.
    """
    try:
        return await victoria_client.query_range(query, start, end, step)
    except httpx.HTTPStatusError as e:
        _LOGGER.warning(f"VictoriaMetrics range query error: {e}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Query failed: {e.response.text}",
        )
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


@router.get("/speedtest/history")
async def get_speedtest_history(
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("5m", description="Query resolution step"),
) -> dict[str, Any]:
    """Get speedtest history for charts.

    Returns download and upload speeds over time.

    Args:
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Download and upload speed history.
    """
    try:
        download = await victoria_client.query_range(
            "eero_speed_download_mbps", start, end, step
        )
        upload = await victoria_client.query_range(
            "eero_speed_upload_mbps", start, end, step
        )
        return {"download": download, "upload": upload}
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


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
    try:
        # eero-prometheus-exporter uses device_id label (MAC without colons)
        signal_strength = await victoria_client.query_range(
            f'eero_device_signal_strength_dbm{{device_id="{device_id}"}}',
            start,
            end,
            step,
        )
        connection_score = await victoria_client.query_range(
            f'eero_device_connection_score_bars{{device_id="{device_id}"}}',
            start,
            end,
            step,
        )
        return {
            "signal_strength": signal_strength,
            "connection_score": connection_score,
        }
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


# Keep backwards compatibility with old endpoint
@router.get("/devices/{mac}/bandwidth")
async def get_device_bandwidth(
    mac: str,
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("1m", description="Query resolution step"),
) -> dict[str, Any]:
    """Get device signal history (backwards compatible endpoint).

    Note: Bandwidth metrics are not available from eero-prometheus-exporter.
    This endpoint returns signal strength data instead.

    Args:
        mac: The device ID (MAC address without colons, lowercase).
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Signal strength data (labeled as rx/tx for backwards compatibility).
    """
    try:
        # Use device_id label format
        signal = await victoria_client.query_range(
            f'eero_device_signal_strength_dbm{{device_id="{mac}"}}',
            start,
            end,
            step,
        )
        # Return signal as both rx and tx for chart compatibility
        return {"rx": signal, "tx": signal}
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


@router.get("/eeros/{serial}/quality")
async def get_eero_mesh_quality(
    serial: str,
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("5m", description="Query resolution step"),
) -> dict[str, Any]:
    """Get eero mesh quality history.

    Returns mesh quality metrics over time for a specific eero.

    Args:
        serial: The eero serial number.
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Mesh quality history (0-5 bars).
    """
    try:
        # eero-prometheus-exporter uses eero_eero_mesh_quality_bars metric
        # with eero_id label containing the serial number
        quality = await victoria_client.query_range(
            f'eero_eero_mesh_quality_bars{{eero_id="{serial}"}}', start, end, step
        )
        return {"mesh_quality": quality}
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )


@router.get("/network/client_count")
async def get_network_client_count(
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("5m", description="Query resolution step"),
) -> dict[str, Any]:
    """Get network client count history.

    Returns the number of connected clients over time, including
    total, wireless, and wired counts.

    Args:
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Client count history (total, wireless, wired).
    """
    try:
        # Total connected clients
        total = await victoria_client.query_range(
            "eero_network_clients_count", start, end, step
        )
        # Wireless clients count
        wireless = await victoria_client.query_range(
            'count(eero_device_connected{connection_type="wireless"} == 1)',
            start,
            end,
            step,
        )
        # Wired clients count
        wired = await victoria_client.query_range(
            'count(eero_device_connected{connection_type="wired"} == 1)',
            start,
            end,
            step,
        )
        return {
            "total": total,
            "wireless": wireless,
            "wired": wired,
            # Keep backwards compatibility
            "client_count": total,
        }
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )
