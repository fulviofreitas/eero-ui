"""Device routes for the Eero Dashboard."""

import logging

from eero import EeroClient
from eero.exceptions import EeroException
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..deps import get_network_id, require_auth
from ..transformers import check_success, extract_data, extract_list, normalize_device

router = APIRouter()
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

    class Config:
        """Pydantic config."""

        extra = "ignore"


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

    class Config:
        """Pydantic config."""

        extra = "ignore"


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
    try:
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
    except EeroException as e:
        _LOGGER.error(f"Failed to get devices: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve devices. Please try again.",
        )


@router.get("/{device_id}", response_model=DeviceDetail)
async def get_device(
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> DeviceDetail:
    """Get full detailed information about a specific device."""
    try:
        raw_response = await client.get_device(
            device_id, network_id, refresh_cache=refresh
        )
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
            network_id=device.get("network_id"),
            subnet_kind=device.get("subnet_kind"),
            auth=device.get("auth"),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to get device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device not found: {device_id}",
        )


@router.post("/{device_id}/block", response_model=DeviceAction)
async def block_device(
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Block a device from the network."""
    try:
        raw_result = await client.block_device(
            device_id, blocked=True, network_id=network_id
        )
        success = check_success(raw_result)
        return DeviceAction(
            success=success,
            device_id=device_id,
            action="block",
            message=(
                "Device blocked successfully." if success else "Failed to block device."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to block device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to block device. Please try again.",
        )


@router.post("/{device_id}/unblock", response_model=DeviceAction)
async def unblock_device(
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Unblock a device from the network."""
    try:
        raw_result = await client.block_device(
            device_id, blocked=False, network_id=network_id
        )
        success = check_success(raw_result)
        return DeviceAction(
            success=success,
            device_id=device_id,
            action="unblock",
            message=(
                "Device unblocked successfully."
                if success
                else "Failed to unblock device."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to unblock device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unblock device. Please try again.",
        )


@router.put("/{device_id}/nickname", response_model=DeviceAction)
async def set_device_nickname(
    device_id: str,
    request: NicknameRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Set a nickname for a device."""
    try:
        raw_result = await client.set_device_nickname(
            device_id, request.nickname, network_id=network_id
        )
        success = check_success(raw_result)
        return DeviceAction(
            success=success,
            device_id=device_id,
            action="nickname",
            message=(
                f"Nickname set to '{request.nickname}'."
                if success
                else "Failed to set nickname."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to set nickname for device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set device nickname. Please try again.",
        )


@router.post("/{device_id}/prioritize", response_model=DeviceAction)
async def prioritize_device(
    device_id: str,
    duration_minutes: int = Query(
        0, description="Duration in minutes (0 = indefinite)"
    ),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Prioritize bandwidth for a device."""
    try:
        raw_result = await client.prioritize_device(
            device_id, duration_minutes=duration_minutes, network_id=network_id
        )
        success = check_success(raw_result)
        return DeviceAction(
            success=success,
            device_id=device_id,
            action="prioritize",
            message=(
                "Device prioritized." if success else "Failed to prioritize device."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to prioritize device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to prioritize device. Please try again.",
        )


@router.post("/{device_id}/deprioritize", response_model=DeviceAction)
async def deprioritize_device(
    device_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> DeviceAction:
    """Remove bandwidth priority from a device."""
    try:
        raw_result = await client.deprioritize_device(device_id, network_id=network_id)
        success = check_success(raw_result)
        return DeviceAction(
            success=success,
            device_id=device_id,
            action="deprioritize",
            message="Priority removed." if success else "Failed to remove priority.",
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to deprioritize device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove device priority. Please try again.",
        )
