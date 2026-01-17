"""Device routes for the Eero Dashboard."""

import logging

from eero import EeroClient
from eero.exceptions import EeroException
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..deps import get_network_id, require_auth

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
        devices = await client.get_devices(network_id, refresh_cache=refresh)

        # Parse device_ids filter if provided
        device_id_filter = None
        if device_ids:
            device_id_filter = set(device_ids.split(","))
            _LOGGER.debug(f"Filtering by {len(device_id_filter)} device IDs")

        result = []
        matched_ids = set()
        skipped_devices = []

        for device in devices:
            try:
                # Filter by connected status if requested
                if connected_only and not device.connected:
                    continue

                # Filter by profile ID if requested
                if profile_id and device.profile_id != profile_id:
                    continue

                # Filter by device IDs if requested
                if device_id_filter:
                    # Try matching by ID or MAC address
                    dev_id = device.id
                    device_mac = (
                        device.mac.replace(":", "").lower() if device.mac else None
                    )

                    if dev_id in device_id_filter:
                        matched_ids.add(dev_id)
                    elif device_mac and device_mac in device_id_filter:
                        matched_ids.add(device_mac)
                    else:
                        continue

                # Extract signal strength from connectivity
                signal_strength = None
                frequency = None
                if device.connectivity:
                    if device.connectivity.signal:
                        try:
                            signal_strength = int(
                                device.connectivity.signal.replace(" dBm", "")
                            )
                        except (ValueError, AttributeError):
                            pass
                    if device.connectivity.frequency:
                        freq_mhz = device.connectivity.frequency
                        frequency = "5GHz" if freq_mhz > 4000 else "2.4GHz"

                # Get connected eero name
                connected_to = None
                if device.source:
                    connected_to = device.source.location or device.source.display_name

                # Extract profile info
                device_profile_id = device.profile_id
                device_profile_name = None
                if device.profile:
                    device_profile_name = device.profile.name

                result.append(
                    DeviceSummary(
                        id=device.id,
                        url=device.url,
                        mac=device.mac,
                        ip=device.ip,
                        nickname=device.nickname,
                        hostname=device.hostname,
                        display_name=device.display_name
                        or device.nickname
                        or device.hostname,
                        manufacturer=device.manufacturer,
                        model_name=device.model_name,
                        device_type=device.device_type,
                        connected=device.connected or False,
                        wireless=device.wireless or False,
                        blocked=device.blacklisted or False,
                        paused=device.paused or False,
                        is_guest=device.is_guest or False,
                        connection_type="wireless" if device.wireless else "wired",
                        signal_strength=signal_strength,
                        frequency=frequency,
                        connected_to_eero=connected_to,
                        last_active=(
                            device.last_active.isoformat()
                            if device.last_active
                            else None
                        ),
                        profile_id=device_profile_id,
                        profile_name=device_profile_name,
                    )
                )
            except Exception as e:
                # Log any device that fails to process - this should NEVER happen
                _LOGGER.error(
                    f"CRITICAL: Failed to process device {getattr(device, 'id', 'unknown')}: {e}"
                )
                skipped_devices.append(getattr(device, "id", "unknown"))

        if skipped_devices:
            _LOGGER.error(
                f"CRITICAL: Skipped {len(skipped_devices)} devices due to processing errors: {skipped_devices}"
            )

        if device_id_filter:
            _LOGGER.debug(
                f"Matched {len(matched_ids)} of {len(device_id_filter)} requested device IDs"
            )

        # Log counts to identify any discrepancies
        _LOGGER.info(
            f"Devices API: eero_api_count={len(devices)}, returned_count={len(result)}, filters_applied=(connected_only={connected_only}, profile_id={profile_id}, device_ids={device_ids is not None})"
        )

        # CRITICAL: Ensure we're returning exactly what the eero API gives us (when no filters)
        if not connected_only and not profile_id and not device_ids:
            if len(devices) != len(result):
                _LOGGER.warning(
                    f"DISCREPANCY: eero API returned {len(devices)} devices but we're returning {len(result)}"
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
        device = await client.get_device(device_id, network_id, refresh_cache=refresh)

        # Extract connectivity details
        signal_strength = None
        signal_bars = None
        frequency = None
        frequency_mhz = None
        rx_bitrate = None
        tx_bitrate = None

        if device.connectivity:
            if device.connectivity.signal:
                try:
                    signal_strength = int(
                        device.connectivity.signal.replace(" dBm", "")
                    )
                except (ValueError, AttributeError):
                    pass
            signal_bars = device.connectivity.score_bars
            if device.connectivity.frequency:
                frequency_mhz = device.connectivity.frequency
                frequency = "5GHz" if frequency_mhz > 4000 else "2.4GHz"
            rx_bitrate = device.connectivity.rx_bitrate
            tx_bitrate = device.connectivity.tx_bitrate

            # Extract TX bitrate from tx_rate_info if not directly available
            if not tx_bitrate and device.connectivity.tx_rate_info:
                tx_info = device.connectivity.tx_rate_info
                if isinstance(tx_info, dict):
                    # The rate is in rate_bps (bits per second)
                    rate_bps = tx_info.get("rate_bps")
                    if rate_bps and isinstance(rate_bps, (int, float)) and rate_bps > 0:
                        # Convert bps to Mbit/s
                        rate_mbps = rate_bps / 1_000_000
                        tx_bitrate = f"{rate_mbps:.1f} MBit/s"

            # Extract RX bitrate from rx_rate_info as fallback
            if not rx_bitrate and device.connectivity.rx_rate_info:
                rx_info = device.connectivity.rx_rate_info
                if isinstance(rx_info, dict):
                    rate_bps = rx_info.get("rate_bps")
                    if rate_bps and isinstance(rate_bps, (int, float)) and rate_bps > 0:
                        rate_mbps = rate_bps / 1_000_000
                        rx_bitrate = f"{rate_mbps:.1f} MBit/s"

        # Extract connected eero info
        connected_to = None
        connected_to_id = None
        connected_to_model = None
        if device.source:
            connected_to = device.source.location or device.source.display_name
            connected_to_model = device.source.model
            if device.source.url:
                # Extract eero ID from URL
                import re

                match = re.search(r"/eeros/([^/]+)", device.source.url)
                if match:
                    connected_to_id = match.group(1)

        # Extract profile info
        profile_id = device.profile_id
        profile_name = None
        if device.profile:
            profile_name = device.profile.name

        return DeviceDetail(
            id=device.id,
            url=device.url,
            mac=device.mac,
            ip=device.ip,
            ips=device.ips or [],
            ipv4=device.ipv4,
            nickname=device.nickname,
            hostname=device.hostname,
            display_name=device.display_name or device.nickname or device.hostname,
            manufacturer=device.manufacturer,
            model_name=device.model_name,
            device_type=device.device_type,
            connected=device.connected or False,
            wireless=device.wireless or False,
            connection_type="wireless" if device.wireless else "wired",
            blocked=device.blacklisted or False,
            paused=device.paused or False,
            is_guest=device.is_guest or False,
            is_private=device.is_private or False,
            signal_strength=signal_strength,
            signal_bars=signal_bars,
            frequency=frequency,
            frequency_mhz=frequency_mhz,
            channel=device.channel,
            ssid=device.ssid,
            rx_bitrate=rx_bitrate,
            tx_bitrate=tx_bitrate,
            connected_to_eero=connected_to,
            connected_to_eero_id=connected_to_id,
            connected_to_eero_model=connected_to_model,
            profile_id=profile_id,
            profile_name=profile_name,
            last_active=device.last_active.isoformat() if device.last_active else None,
            first_active=(
                device.first_active.isoformat() if device.first_active else None
            ),
            network_id=device.network_id,
            subnet_kind=device.subnet_kind,
            auth=device.auth,
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
        success = await client.block_device(
            device_id, blocked=True, network_id=network_id
        )
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
        success = await client.block_device(
            device_id, blocked=False, network_id=network_id
        )
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
        success = await client.set_device_nickname(
            device_id, request.nickname, network_id=network_id
        )
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
        success = await client.prioritize_device(
            device_id, duration_minutes=duration_minutes, network_id=network_id
        )
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
        success = await client.deprioritize_device(device_id, network_id=network_id)
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
