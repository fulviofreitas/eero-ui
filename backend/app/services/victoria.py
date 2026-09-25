"""VictoriaMetrics client for writing and querying time-series data.

VictoriaMetrics is the embedded storage layer for eero-ui's metrics. The
collector (``services/collector.py``) writes samples here via the JSON
import API, and ``routes/metrics.py`` reads them back with the same client.

See ``.claude/tasks/phase-6.0-revamp.md`` § 2.2 for the architecture
decision and § 10 R2b for the live verification of the import API against
the pinned VictoriaMetrics v1.96.0 binary that this module's ``write()``
implementation is based on.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

from ..config import settings

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class Sample:
    """A single time-series sample for the VictoriaMetrics JSON import API.

    Attributes:
        name: The metric name (``__name__``).
        labels: Label key/value pairs, excluding ``__name__``. Values must
            already be strings -- callers are responsible for coercing
            ``None`` to ``""`` before constructing a Sample.
        value: The sample value.
        timestamp_ms: Unix epoch milliseconds for this sample.
    """

    name: str
    value: float
    timestamp_ms: int
    labels: dict[str, str] = field(default_factory=dict)

    def to_import_line(self) -> str:
        """Render this sample as one line of VictoriaMetrics' NDJSON import format.

        Returns:
            A single JSON line (no trailing newline) matching
            ``{"metric": {...}, "values": [...], "timestamps": [...]}``.
        """
        metric: dict[str, str] = {"__name__": self.name, **self.labels}
        return json.dumps(
            {
                "metric": metric,
                "values": [self.value],
                "timestamps": [self.timestamp_ms],
            }
        )


class VictoriaWriteError(Exception):
    """Raised when a write to VictoriaMetrics fails at the transport/HTTP layer.

    Note:
        VictoriaMetrics' ``/api/v1/import`` endpoint returns HTTP 204 even
        when some or all lines in the request body were unparseable -- it
        silently drops bad lines and never reports that in the response
        (verified live against the pinned v1.96.0 binary, see §10 R2b).
        This exception can therefore only ever signal a transport failure
        or a non-2xx HTTP status; it cannot detect a partial content-level
        drop. Callers must construct valid NDJSON (which ``Sample`` does)
        rather than rely on this exception for that class of failure.
    """


class VictoriaMetricsClient:
    """Client for reading and writing VictoriaMetrics time-series data.

    VictoriaMetrics provides a Prometheus-compatible API for querying
    time-series data using PromQL, plus a JSON import API for writes.
    """

    def __init__(self, base_url: str | None = None) -> None:
        """Initialize the VictoriaMetrics client.

        Args:
            base_url: Base URL for VictoriaMetrics API. Defaults to settings.
        """
        self.base_url = base_url or settings.victoria_metrics_url
        self.last_successful_write: datetime | None = None
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or lazily create the shared httpx.AsyncClient.

        Returns:
            The shared client instance, created on first use.
        """
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        return self._client

    async def aclose(self) -> None:
        """Close the shared httpx.AsyncClient.

        Must be called from the application's shutdown path so the
        underlying connection pool is released.
        """
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def write(self, samples: list[Sample]) -> None:
        """Write samples to VictoriaMetrics via the JSON import API.

        Args:
            samples: The samples to write. A no-op if empty.

        Raises:
            VictoriaWriteError: If the request fails at the transport or
                HTTP-status layer. See the class docstring for the limits
                of what this can detect.
        """
        if not samples:
            return

        body = "\n".join(sample.to_import_line() for sample in samples)
        client = self._get_client()
        try:
            response = await client.post(
                "/api/v1/import",
                content=body,
                headers={"Content-Type": "application/x-ndjson"},
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise VictoriaWriteError(f"Failed to write to VictoriaMetrics: {e}") from e

        self.last_successful_write = datetime.now(UTC)

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

        client = self._get_client()
        response = await client.get("/api/v1/query", params=params)
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
        client = self._get_client()
        response = await client.get(
            "/api/v1/query_range",
            params={
                "query": promql,
                "start": start,
                "end": end,
                "step": step,
            },
        )
        response.raise_for_status()
        return response.json()

    async def health(self) -> bool:
        """Check if VictoriaMetrics is healthy.

        Returns:
            True if VictoriaMetrics is responding, False otherwise.
        """
        try:
            client = self._get_client()
            response = await client.get("/health", timeout=5.0)
            return response.status_code == 200
        except httpx.RequestError as e:
            _LOGGER.debug("VictoriaMetrics health check failed: %s", e)
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
        client = self._get_client()
        response = await client.get(
            f"/api/v1/label/{label}/values",
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("data", [])


# Singleton instance for dependency injection
victoria_client = VictoriaMetricsClient()
