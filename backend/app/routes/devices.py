"""Device routes for the Eero Dashboard."""

import logging

from eero import EeroClient
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict

from ..deps import (
    get_network_id,
    require_auth,
    require_experimental_writes,
    validate_request_path_ids,
)
from ..transformers import (
    check_success,
    extract_data,
    extract_list,
    has_control_or_format_chars,
    is_valid_device_type,
    normalize_device,
)
from .auth import limiter
from .networks import InsightsResponse, normalize_insights, validate_insight_params

router = APIRouter(dependencies=[Depends(validate_request_path_ids)])
_LOGGER = logging.getLogger(__name__)


class DeviceSummary(BaseModel):
    """Summary of a connected device."""

    id: str | None = None
    url: str | None = None
    mac: str | None = None
    ip: str | None = None
    nickname: str | None = None
    hostname: str | None = None
    display_name: str | None = None
    manufacturer: str | None = None
    model_name: str | None = None
    device_type: str | None = None
    connected: bool = False
    wireless: bool = False
    blocked: bool = False
    paused: bool = False
    is_guest: bool = False
    connection_type: str | None = None
    signal_strength: int | None = None
    frequency: str | None = None
    connected_to_eero: str | None = None
    last_active: str | None = None
    profile_id: str | None = None
    profile_name: str | None = None

    model_config = ConfigDict(extra="ignore")


class DeviceDetail(BaseModel):
    """Full device details."""

    # Core info
    id: str | None = None
    url: str | None = None
    mac: str | None = None
    ip: str | None = None
    ips: list[str] = []
    ipv4: str | None = None

    # Identification
    nickname: str | None = None
    hostname: str | None = None
    display_name: str | None = None
    manufacturer: str | None = None
    model_name: str | None = None
    device_type: str | None = None

    # Connection status
    connected: bool = False
    wireless: bool = False
    connection_type: str | None = None

    # Status flags
    blocked: bool = False
    paused: bool = False
    is_guest: bool = False
    is_private: bool = False

    # Connectivity details
    signal_strength: int | None = None
    signal_bars: int | None = None
    frequency: str | None = None
    frequency_mhz: int | None = None
    channel: int | None = None
    ssid: str | None = None
    rx_bitrate: str | None = None
    tx_bitrate: str | None = None

    # Connected to
    connected_to_eero: str | None = None
    connected_to_eero_id: str | None = None
    connected_to_eero_model: str | None = None

    # Profile
    profile_id: str | None = None
    profile_name: str | None = None

    # Timestamps
    last_active: str | None = None
    first_active: str | None = None

    # Network
    network_id: str | None = None
    subnet_kind: str | None = None
    auth: str | None = None

    model_config = ConfigDict(extra="ignore")


class DeviceAction(BaseModel):
    """Response for device action endpoints."""

    success: bool
    device_id: str
    action: str
    message: str | None = None


class NicknameRequest(BaseModel):
    """Request body for setting device nickname."""

    nickname: str


@router.get("", response_model=list[DeviceSummary])
async def list_devices(
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
    connected_only: bool = Query(False, description="Only show connected devices"),
    profile_id: str | None = Query(None, description="Filter by profile ID"),
    device_ids: str | None = Query(
        None, description="Filter by comma-separated device IDs"
    ),
) -> list[DeviceSummary]:
    """Get list of all devices on the network."""
    raw_response = await client.get_devices(network_id, refresh_cache=refresh)
    raw_devices = extract_list(raw_response, "devices")

    # Parse device_ids filter if provided
    device_id_filter = None
    if device_ids:
        device_id_filter = set(device_ids.split(","))
        _LOGGER.debug(f"Filtering by {len(device_id_filter)} device IDs")

    result = []
    matched_ids = set()
    skipped_devices = []

    # This per-device loop is a real fallback (phase-6.0-revamp.md § 3.4):
    # one malformed device must not blank the whole list.
    for raw_dev in raw_devices:
        try:
            device = normalize_device(raw_dev)

            # Filter by connected status if requested
            if connected_only and not device.get("connected"):
                continue

            # Filter by profile ID if requested
            if profile_id and device.get("profile_id") != profile_id:
                continue

            # Filter by device IDs if requested
            if device_id_filter:
                dev_id = device.get("id")
                device_mac = device.get("mac")
                if device_mac:
                    device_mac = device_mac.replace(":", "").lower()

                if dev_id in device_id_filter:
                    matched_ids.add(dev_id)
                elif device_mac and device_mac in device_id_filter:
                    matched_ids.add(device_mac)
                else:
                    continue

            # Format last_active
            last_active = device.get("last_active")
            if last_active and hasattr(last_active, "isoformat"):
                last_active = last_active.isoformat()

            result.append(
                DeviceSummary(
                    id=device.get("id"),
                    url=device.get("url"),
                    mac=device.get("mac"),
                    ip=device.get("ip"),
                    nickname=device.get("nickname"),
                    hostname=device.get("hostname"),
                    display_name=device.get("display_name"),
                    manufacturer=device.get("manufacturer"),
                    model_name=device.get("model_name"),
                    device_type=device.get("device_type"),
                    connected=device.get("connected", False),
                    wireless=device.get("wireless", False),
                    blocked=device.get("blocked", False),
                    paused=device.get("paused", False),
                    is_guest=device.get("is_guest", False),
                    connection_type=device.get("connection_type"),
                    signal_strength=device.get("signal_strength"),
                    frequency=device.get("frequency"),
                    connected_to_eero=device.get("connected_to_eero"),
                    last_active=last_active,
                    profile_id=device.get("profile_id"),
                    profile_name=device.get("profile_name"),
                )
            )
        except Exception as e:
            _LOGGER.error(
                f"CRITICAL: Failed to process device {raw_dev.get('url', 'unknown')}: {e}"
            )
            skipped_devices.append(raw_dev.get("url", "unknown"))

    if skipped_devices:
        _LOGGER.error(
            f"CRITICAL: Skipped {len(skipped_devices)} devices due to processing errors"
        )

    if device_id_filter:
        _LOGGER.debug(
            f"Matched {len(matched_ids)} of {len(device_id_filter)} requested device IDs"
        )

    _LOGGER.info(
        f"Devices API: eero_api_count={len(raw_devices)}, returned_count={len(result)}"
    )

    return result


@router.get("/{device_id}", response_model=DeviceDetail)
async def get_device(
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> DeviceDetail:
    """Get full detailed information about a specific device."""
    raw_response = await client.get_device(device_id, network_id, refresh_cache=refresh)
    device = normalize_device(extract_data(raw_response))

    # Format timestamps
    last_active = device.get("last_active")
    if last_active and hasattr(last_active, "isoformat"):
        last_active = last_active.isoformat()
    first_active = device.get("first_active")
    if first_active and hasattr(first_active, "isoformat"):
        first_active = first_active.isoformat()

    return DeviceDetail(
        id=device.get("id"),
        url=device.get("url"),
        mac=device.get("mac"),
        ip=device.get("ip"),
        ips=device.get("ips") or [],
        ipv4=device.get("ipv4"),
        nickname=device.get("nickname"),
        hostname=device.get("hostname"),
        display_name=device.get("display_name"),
        manufacturer=device.get("manufacturer"),
        model_name=device.get("model_name"),
        device_type=device.get("device_type"),
        connected=device.get("connected", False),
        wireless=device.get("wireless", False),
        connection_type=device.get("connection_type"),
        blocked=device.get("blocked", False),
        paused=device.get("paused", False),
        is_guest=device.get("is_guest", False),
        is_private=device.get("is_private", False),
        signal_strength=device.get("signal_strength"),
        signal_bars=device.get("signal_bars"),
        frequency=device.get("frequency"),
        frequency_mhz=device.get("frequency_mhz"),
        channel=device.get("channel"),
        ssid=device.get("ssid"),
        rx_bitrate=device.get("rx_bitrate"),
        tx_bitrate=device.get("tx_bitrate"),
        connected_to_eero=device.get("connected_to_eero"),
        connected_to_eero_id=device.get("connected_to_eero_id"),
        connected_to_eero_model=device.get("connected_to_eero_model"),
        profile_id=device.get("profile_id"),
        profile_name=device.get("profile_name"),
        last_active=last_active,
        first_active=first_active,
        network_id=network_id,  # Use the network_id from the dependency
        subnet_kind=device.get("subnet_kind"),
        auth=device.get("auth"),
    )


async def _resolve_device_mac(
    client: EeroClient, device_id: str, network_id: str
) -> str:
    """Resolve a device's MAC address server-side (phase-6.0-revamp.md § 3.3).

    v8's ``block_device``/``unblock_device`` post ``mac=`` to the blacklist,
    not the URL-derived device id, so the caller-supplied ``device_id`` must
    be resolved to a MAC before either call.

    Raises:
        HTTPException: 422 if the device has no known MAC address.
    """
    raw_response = await client.get_device(device_id, network_id)
    device = normalize_device(extract_data(raw_response))
    mac = device.get("mac")
    if not mac:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Device has no known MAC address.",
        )
    return mac


@router.post(
    "/{device_id}/block",
    response_model=DeviceAction,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def block_device(
    request: Request,
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Block a device from the network.

    Unverified write (phase-6.0-revamp.md § 5): gated behind
    ``EERO_DASHBOARD_EXPERIMENTAL_WRITES`` (decision 6a). ``unblock_device``
    is not gated - it is in the SDK's verified-write allowlist.
    """
    mac = await _resolve_device_mac(client, device_id, network_id)
    raw_result = await client.block_device(mac, network_id=network_id)
    success = check_success(raw_result)
    return DeviceAction(
        success=success,
        device_id=device_id,
        action="block",
        message=(
            "Device blocked successfully." if success else "Failed to block device."
        ),
    )


@router.post("/{device_id}/unblock", response_model=DeviceAction)
async def unblock_device(
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Unblock a device from the network."""
    mac = await _resolve_device_mac(client, device_id, network_id)
    raw_result = await client.unblock_device(mac, network_id=network_id)
    success = check_success(raw_result)
    return DeviceAction(
        success=success,
        device_id=device_id,
        action="unblock",
        message=(
            "Device unblocked successfully." if success else "Failed to unblock device."
        ),
    )


@router.put("/{device_id}/nickname", response_model=DeviceAction)
async def set_device_nickname(
    device_id: str,
    request: NicknameRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Set a nickname for a device."""
    nickname = request.nickname.strip()
    if not nickname:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nickname cannot be empty.",
        )
    if len(nickname) > 64:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nickname must be 64 characters or fewer.",
        )
    if has_control_or_format_chars(nickname):
        # Static detail (security review, 2026-09-24): never echoes the
        # offending character or its position back to the caller.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nickname is invalid.",
        )

    raw_result = await client.set_device_nickname(
        device_id, nickname, network_id=network_id
    )
    success = check_success(raw_result)
    return DeviceAction(
        success=success,
        device_id=device_id,
        action="nickname",
        message=(
            f"Nickname set to '{nickname}'." if success else "Failed to set nickname."
        ),
    )


class DeviceTypeRequest(BaseModel):
    """Request body for setting a device's type."""

    device_type: str

    model_config = ConfigDict(extra="ignore")


@router.put("/{device_id}/type", response_model=DeviceAction)
@limiter.shared_limit("10/minute", scope="device_type")
async def set_device_type_route(
    request: Request,
    device_id: str,
    body: DeviceTypeRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Set a device's type.

    Verified write (sdk-surface-map-v8.0.3.md WP6 allowlist): the value
    persists and reads back correctly. eero-api ships no device-type
    catalogue, so ``device_type`` is validated against a conservative
    ``^[a-z0-9_]{1,40}$`` allowlist rather than a fixed enum; never expose
    ``set_device_labels`` (verified no-op). Rate limited to 10/minute
    (security review, 2026-09-24).
    """
    device_type = body.device_type.strip()
    if not is_valid_device_type(device_type):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="device_type must match ^[a-z0-9_]{1,40}$.",
        )
    raw_result = await client.set_device_type(
        device_id, device_type, network_id=network_id
    )
    success = check_success(raw_result)
    return DeviceAction(
        success=success,
        device_id=device_id,
        action="device_type",
        message=(
            f"Device type set to '{device_type}'."
            if success
            else "Failed to set device type."
        ),
    )


class SecondaryWanAccessRequest(BaseModel):
    """Request body for PUT /{device_id}/secondary-wan-access."""

    deny: bool


class SecondaryWanAccessResponse(BaseModel):
    """Response for a per-device secondary-WAN-access write."""

    success: bool
    changed: bool
    reboot_expected: bool = True
    deny: bool


# WP8 (phase-6.0-revamp.md § 5, § 7; sdk-surface-map-v8.0.3.md WP8): its own
# module-level gate constant, distinct from every other settings-class
# route's, so it can be lifted independently after live verification.
_SECONDARY_WAN_ACCESS_GATE = require_experimental_writes


@router.put(
    "/{device_id}/secondary-wan-access",
    response_model=SecondaryWanAccessResponse,
    dependencies=[Depends(_SECONDARY_WAN_ACCESS_GATE)],
)
@limiter.shared_limit("2/minute", scope="settings_writes")
async def update_secondary_wan_access(
    request: Request,
    device_id: str,
    body: SecondaryWanAccessRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> SecondaryWanAccessResponse:
    """Deny or allow a single device's secondary-WAN access.

    Settings-class by its own SDK docstring
    (``set_device_secondary_wan_access``, sdk-surface-map-v8.0.3.md WP8).
    Best-effort no-op guard: reads the device's raw envelope for a
    ``secondary_wan_deny_access`` key, which is not documented as
    guaranteed present - if absent, the write always proceeds (documented
    gap, not a silent skip). Gated behind ``_SECONDARY_WAN_ACCESS_GATE``.
    """
    mac = await _resolve_device_mac(client, device_id, network_id)

    raw_device = extract_data(await client.get_device(device_id, network_id))
    current = raw_device.get("secondary_wan_deny_access")

    if current is not None and bool(current) == body.deny:
        return SecondaryWanAccessResponse(success=True, changed=False, deny=body.deny)

    _LOGGER.warning(
        "Setting secondary-WAN access for device %s on network %s - settings-class "
        "write, treated as a mesh reboot",
        device_id,
        network_id,
    )
    raw_result = await client.set_device_secondary_wan_access(
        mac, deny=body.deny, network_id=network_id
    )
    success = check_success(raw_result)
    return SecondaryWanAccessResponse(success=success, changed=True, deny=body.deny)


@router.get("/{device_id}/insights", response_model=InsightsResponse)
async def get_device_insights_route(
    device_id: str,
    start: str = Query(..., description="ISO-8601 window start"),
    end: str = Query(..., description="ISO-8601 window end"),
    insight_type: str = Query(..., description="adblock | blocked | inspected"),
    cadence: str = Query("daily", description="daily | hourly"),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> InsightsResponse:
    """Query a single device's insights time series. Premium-gated."""
    validate_insight_params(start, end, insight_type, cadence)
    raw = await client.get_device_insights(
        device_id,
        network_id=network_id,
        start=start,
        end=end,
        cadence=cadence,
        insight_type=insight_type,
    )
    return normalize_insights(raw)
