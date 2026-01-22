"""VictoriaMetrics query client for historical metrics data."""

import logging
from typing import Any

import httpx

from ..config import settings

_LOGGER = logging.getLogger(__name__)


class VictoriaMetricsClient:
    """Client for querying VictoriaMetrics for historical metrics data.

    VictoriaMetrics provides a Prometheus-compatible API for querying
    time-series data using PromQL.
    """

    def __init__(self, base_url: str | None = None) -> None:
        """Initialize the VictoriaMetrics client.

        Args:
            base_url: Base URL for VictoriaMetrics API. Defaults to settings.
        """
        self.base_url = base_url or settings.victoria_metrics_url

    async def query(self, promql: str, time: str | None = None) -> dict[str, Any]:
        """Execute an instant PromQL query.

        Args:
            promql: The PromQL query string.
            time: Optional evaluation timestamp (RFC3339 or Unix timestamp).

        Returns:
            Query result from VictoriaMetrics API.

        Raises:
            httpx.HTTPError: If the request fails.
        """
        params: dict[str, str] = {"query": promql}
        if time:
            params["time"] = time

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v1/query",
                params=params,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    async def query_range(
        self,
        promql: str,
        start: str,
        end: str,
        step: str = "1m",
    ) -> dict[str, Any]:
        """Execute a range PromQL query for historical data.

        Args:
            promql: The PromQL query string.
            start: Start time (RFC3339 or Unix timestamp).
            end: End time (RFC3339 or Unix timestamp).
            step: Query resolution step (e.g., "1m", "5m", "1h").

        Returns:
            Query result from VictoriaMetrics API.

        Raises:
            httpx.HTTPError: If the request fails.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v1/query_range",
                params={
                    "query": promql,
                    "start": start,
                    "end": end,
                    "step": step,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    async def health(self) -> bool:
        """Check if VictoriaMetrics is healthy.

        Returns:
            True if VictoriaMetrics is responding, False otherwise.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/health",
                    timeout=5.0,
                )
                return response.status_code == 200
        except httpx.RequestError as e:
            _LOGGER.debug(f"VictoriaMetrics health check failed: {e}")
            return False

    async def get_label_values(self, label: str) -> list[str]:
        """Get all values for a specific label.

        Args:
            label: The label name (e.g., "mac", "network_id").

        Returns:
            List of label values.

        Raises:
            httpx.HTTPError: If the request fails.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/v1/label/{label}/values",
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])


# Singleton instance for dependency injection
victoria_client = VictoriaMetricsClient()
