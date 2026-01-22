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


@router.get("/devices/{mac}/bandwidth")
async def get_device_bandwidth(
    mac: str,
    start: str = Query(..., description="Start time (RFC3339 or Unix timestamp)"),
    end: str = Query(..., description="End time (RFC3339 or Unix timestamp)"),
    step: str = Query("1m", description="Query resolution step"),
) -> dict[str, Any]:
    """Get device bandwidth history.

    Returns RX and TX bitrates over time for a specific device.

    Args:
        mac: The device MAC address.
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        RX and TX bitrate history.
    """
    try:
        rx = await victoria_client.query_range(
            f'eero_device_rx_bitrate{{mac="{mac}"}}', start, end, step
        )
        tx = await victoria_client.query_range(
            f'eero_device_tx_bitrate{{mac="{mac}"}}', start, end, step
        )
        return {"rx": rx, "tx": tx}
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
        Mesh quality history.
    """
    try:
        quality = await victoria_client.query_range(
            f'eero_mesh_quality_bars{{serial_number="{serial}"}}', start, end, step
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

    Returns the number of connected clients over time.

    Args:
        start: Start time for the range.
        end: End time for the range.
        step: Query resolution step.

    Returns:
        Client count history.
    """
    try:
        client_count = await victoria_client.query_range(
            "eero_network_clients_count", start, end, step
        )
        return {"client_count": client_count}
    except httpx.RequestError as e:
        _LOGGER.error(f"VictoriaMetrics connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Metrics service unavailable",
        )
