"""Eero's live Internet usage, excluding local LAN transfers.

The device list returns zero/stale usage until burst_reporters is requested.
Live-verified against eero-api 8.3.0: POST returns next_burst and fresh device
usage appears after a short wait. This does not run a speed test. Keep the
SDK compatibility shim here until EeroClient exposes this endpoint itself.
"""

import asyncio
import math
from typing import Any

from eero import EeroClient
from eero.exceptions import EeroAPIException, EeroAuthenticationException

from ..transformers import extract_data, validate_path_id

MIN_INTERVAL_SECONDS = 60
EXPIRY_SECONDS = 90
SETTLE_SECONDS = 12


async def prepare_wan_sample(client: EeroClient, network_id: str) -> None:
    """Request live counters through the SDK's authenticated transport."""
    validate_path_id(network_id)
    # 8.3 has no public EeroClient wrapper for burst_reporters. Reusing its
    # transport preserves token refresh, credential redaction and TLS checks.
    api = client._api
    token = await api.auth.get_auth_token()
    if not token:
        raise EeroAuthenticationException("Not authenticated")
    response = await api.networks.post(
        f"networks/{network_id}/burst_reporters", auth_token=token
    )
    data = extract_data(response)
    if not isinstance(data, dict) or not isinstance(data.get("next_burst"), str):
        raise EeroAPIException(None, "Live usage reporting was not acknowledged")
    await asyncio.sleep(SETTLE_SECONDS)


def aggregate_wan_usage(devices: list[dict[str, Any]]) -> tuple[float, float] | None:
    """Sum connected clients once; an incomplete total is unknown, never zero."""
    download = upload = 0.0
    seen: set[str] = set()
    for device in devices:
        if not isinstance(device, dict):
            return None
        if not device.get("connected"):
            continue
        identity = device.get("mac") or device.get("url")
        if isinstance(identity, str):
            identity = identity.lower()
            if identity in seen:
                continue
            seen.add(identity)
        usage = device.get("usage")
        if not isinstance(usage, dict):
            return None
        down, up = usage.get("down_mbps"), usage.get("up_mbps")
        for value in (down, up):
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value < 0
            ):
                return None
        download += down
        upload += up
    if not math.isfinite(download) or not math.isfinite(upload):
        return None
    return download, upload
