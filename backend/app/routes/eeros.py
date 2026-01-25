"""Eero node routes for the Eero Dashboard."""

import logging
from datetime import datetime, timezone

from eero import EeroClient
from eero.exceptions import EeroException
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..deps import get_network_id, require_auth
from ..transformers import check_success, extract_data, extract_list, normalize_eero

router = APIRouter()
_LOGGER = logging.getLogger(__name__)


def calculate_uptime_seconds(last_reboot: str | None) -> int | None:
    """Calculate uptime in seconds from last_reboot timestamp.

    Args:
        last_reboot: ISO format timestamp of last reboot

    Returns:
        Uptime in seconds, or None if cannot be calculated
    """
    if not last_reboot:
        return None
    try:
        # Parse the timestamp - handle various formats
        reboot_time = None
        for fmt in [
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%f%z",
        ]:
            try:
                reboot_time = datetime.strptime(last_reboot, fmt)
                break
            except ValueError:
                continue

        if reboot_time is None:
            return None

        # Ensure timezone aware
        if reboot_time.tzinfo is None:
            reboot_time = reboot_time.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        delta = now - reboot_time
        return int(delta.total_seconds())
    except Exception as e:
        _LOGGER.debug(f"Failed to calculate uptime from {last_reboot}: {e}")
        return None


class EeroSummary(BaseModel):
    """Summary of an Eero node."""

    id: str
    url: str
    serial: str
    mac_address: str
    model: str
    status: str
    location: str | None = None
    is_gateway: bool = False
    is_primary: bool = False
    connected_clients_count: int = 0
    firmware_version: str | None = None
    ip_address: str | None = None
    mesh_quality_bars: int | None = None
    led_on: bool | None = None
    wired: bool = False

    class Config:
        """Pydantic config."""

        extra = "ignore"


class EeroDetail(BaseModel):
    """Full details of an Eero node."""

    # Basic info
    id: str
    url: str
    serial: str
    mac_address: str
    model: str
    model_number: str | None = None
    status: str
    state: str | None = None
    location: str | None = None

    # Role
    is_gateway: bool = False
    is_primary: bool = False

    # Connection
    wired: bool = False
    connection_type: str | None = None
    mesh_quality_bars: int | None = None
    ip_address: str | None = None
    using_wan: bool | None = None

    # Clients
    connected_clients_count: int = 0
    connected_wired_clients_count: int | None = None
    connected_wireless_clients_count: int | None = None

    # Hardware
    firmware_version: str | None = None
    os_version: str | None = None
    led_on: bool | None = None
    led_brightness: int | None = None

    # Performance
    uptime: int | None = None
    cpu_usage: float | None = None
    memory_usage: float | None = None
    temperature: float | None = None

    # Status
    heartbeat_ok: bool | None = None
    update_available: bool | None = None
    provides_wifi: bool | None = None
    auto_provisioned: bool | None = None
    retrograde_capable: bool | None = None

    # Timestamps
    last_heartbeat: str | None = None
    last_reboot: str | None = None
    joined: str | None = None

    # Network info
    network_name: str | None = None
    network_url: str | None = None

    # WiFi
    bands: list[str] | None = None
    wifi_bssids: list[str] | None = None
    bssids_with_bands: list[dict] | None = None

    # Ethernet
    ethernet_addresses: list[str] | None = None
    ethernet_ports: list[dict] | None = None

    # IPv6
    ipv6_addresses: list[dict] | None = None

    # Organization/ISP
    organization_name: str | None = None
    organization_id: int | None = None

    # Power
    power_source: str | None = None
    power_saving_active: bool | None = None

    class Config:
        """Pydantic config."""

        extra = "ignore"


class EeroAction(BaseModel):
    """Response for eero action endpoints."""

    success: bool
    eero_id: str
    action: str
    message: str | None = None


@router.get("", response_model=list[EeroSummary])
async def list_eeros(
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> list[EeroSummary]:
    """Get list of all Eero nodes on the network."""
    try:
        raw_response = await client.get_eeros(network_id, refresh_cache=refresh)
        raw_eeros = extract_list(raw_response, "eeros")

        result = []
        for raw_eero in raw_eeros:
            eero = normalize_eero(raw_eero)
            result.append(
                EeroSummary(
                    id=eero.get("id") or eero.get("serial") or "",
                    url=eero.get("url") or "",
                    serial=eero.get("serial") or "",
                    mac_address=eero.get("mac_address") or "",
                    model=eero.get("model") or "",
                    status=eero.get("status") or "unknown",
                    location=eero.get("location"),
                    is_gateway=eero.get("is_gateway", False),
                    is_primary=eero.get("is_primary", False),
                    connected_clients_count=eero.get("connected_clients_count", 0),
                    firmware_version=eero.get("firmware_version"),
                    ip_address=eero.get("ip_address"),
                    mesh_quality_bars=eero.get("mesh_quality_bars"),
                    led_on=eero.get("led_on"),
                    wired=eero.get("wired", False),
                )
            )

        return result
    except EeroException as e:
        _LOGGER.error(f"Failed to get eeros: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve eero nodes. Please try again.",
        )


@router.get("/{eero_id}", response_model=EeroDetail)
async def get_eero(
    eero_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> EeroDetail:
    """Get detailed information about a specific Eero node."""
    try:
        raw_response = await client.get_eero(eero_id, network_id, refresh_cache=refresh)
        eero = normalize_eero(extract_data(raw_response))

        # Extract network info
        network = eero.get("network", {}) or {}
        network_name = network.get("name") if isinstance(network, dict) else None
        network_url = network.get("url") if isinstance(network, dict) else None

        # Extract organization info
        org = eero.get("organization", {}) or {}
        organization_name = org.get("name") if isinstance(org, dict) else None
        organization_id = org.get("id") if isinstance(org, dict) else None

        # Extract power info
        power_info = eero.get("power_info", {}) or {}
        power_source = (
            power_info.get("power_source") if isinstance(power_info, dict) else None
        )

        # Extract power saving info
        power_saving = eero.get("power_saving", {}) or {}
        power_saving_active = None
        if isinstance(power_saving, dict):
            schedule = power_saving.get("schedule", {})
            if isinstance(schedule, dict):
                power_saving_active = schedule.get("active")

        # Format timestamps
        last_heartbeat = eero.get("last_heartbeat")
        if last_heartbeat and hasattr(last_heartbeat, "isoformat"):
            last_heartbeat = last_heartbeat.isoformat()

        # Format bssids_with_bands
        bssids_with_bands = eero.get("bssids_with_bands")
        if bssids_with_bands and isinstance(bssids_with_bands, list):
            bssids_with_bands = [
                (
                    {
                        "band": b.get("band"),
                        "ethernet_address": b.get("ethernet_address"),
                    }
                    if isinstance(b, dict)
                    else b
                )
                for b in bssids_with_bands
            ]

        # Format IPv6 addresses
        ipv6_addresses = eero.get("ipv6_addresses")
        if ipv6_addresses and isinstance(ipv6_addresses, list):
            ipv6_addresses = [
                {
                    "address": (
                        addr.get("address") if isinstance(addr, dict) else str(addr)
                    ),
                    "scope": addr.get("scope") if isinstance(addr, dict) else None,
                    "interface": (
                        addr.get("interface") if isinstance(addr, dict) else None
                    ),
                }
                for addr in ipv6_addresses
            ]

        return EeroDetail(
            id=eero.get("id") or eero.get("serial") or eero_id,
            url=eero.get("url") or "",
            serial=eero.get("serial") or "",
            mac_address=eero.get("mac_address") or "",
            model=eero.get("model") or "",
            model_number=eero.get("model_number"),
            status=eero.get("status") or "unknown",
            state=eero.get("state"),
            location=eero.get("location"),
            is_gateway=eero.get("is_gateway", False),
            is_primary=eero.get("is_primary", False),
            wired=eero.get("wired", False),
            connection_type=eero.get("connection_type"),
            mesh_quality_bars=eero.get("mesh_quality_bars"),
            ip_address=eero.get("ip_address"),
            using_wan=eero.get("using_wan"),
            connected_clients_count=eero.get("connected_clients_count", 0),
            connected_wired_clients_count=eero.get("connected_wired_clients_count"),
            connected_wireless_clients_count=eero.get(
                "connected_wireless_clients_count"
            ),
            firmware_version=eero.get("firmware_version"),
            os_version=eero.get("os_version"),
            led_on=eero.get("led_on"),
            led_brightness=eero.get("led_brightness"),
            uptime=eero.get("uptime")
            or calculate_uptime_seconds(eero.get("last_reboot")),
            cpu_usage=eero.get("cpu_usage"),
            memory_usage=eero.get("memory_usage"),
            temperature=eero.get("temperature"),
            heartbeat_ok=eero.get("heartbeat_ok"),
            update_available=eero.get("update_available"),
            provides_wifi=eero.get("provides_wifi"),
            auto_provisioned=eero.get("auto_provisioned"),
            retrograde_capable=eero.get("retrograde_capable"),
            last_heartbeat=last_heartbeat,
            last_reboot=eero.get("last_reboot"),
            joined=eero.get("joined"),
            network_name=network_name,
            network_url=network_url,
            bands=eero.get("bands"),
            wifi_bssids=eero.get("wifi_bssids"),
            bssids_with_bands=bssids_with_bands,
            ethernet_addresses=eero.get("ethernet_addresses"),
            ethernet_ports=eero.get("ethernet_ports"),
            ipv6_addresses=ipv6_addresses,
            organization_name=organization_name,
            organization_id=organization_id,
            power_source=power_source,
            power_saving_active=power_saving_active,
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to get eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Eero not found: {eero_id}",
        )


@router.post("/{eero_id}/reboot", response_model=EeroAction)
async def reboot_eero(
    eero_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroAction:
    """Reboot an Eero node."""
    try:
        raw_result = await client.reboot_eero(eero_id, network_id=network_id)
        success = check_success(raw_result)
        return EeroAction(
            success=success,
            eero_id=eero_id,
            action="reboot",
            message=(
                "Reboot initiated. The eero will be back online in a few minutes."
                if success
                else "Failed to initiate reboot."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to reboot eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reboot eero. Please try again.",
        )


@router.post("/{eero_id}/led", response_model=EeroAction)
async def set_eero_led(
    eero_id: str,
    enabled: bool = Query(..., description="Turn LED on or off"),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroAction:
    """Turn the LED on or off for an Eero node."""
    try:
        raw_result = await client.set_led(
            eero_id, enabled=enabled, network_id=network_id
        )
        success = check_success(raw_result)
        action = "led_on" if enabled else "led_off"
        return EeroAction(
            success=success,
            eero_id=eero_id,
            action=action,
            message=(
                f"LED {'turned on' if enabled else 'turned off'}."
                if success
                else "Failed to change LED state."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to set LED for eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update LED state. Please try again.",
        )


@router.put("/{eero_id}/led/brightness", response_model=EeroAction)
async def set_eero_led_brightness(
    eero_id: str,
    brightness: int = Query(..., ge=0, le=100, description="LED brightness (0-100)"),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroAction:
    """Set the LED brightness for an Eero node."""
    try:
        raw_result = await client.set_led_brightness(
            eero_id, brightness=brightness, network_id=network_id
        )
        success = check_success(raw_result)
        return EeroAction(
            success=success,
            eero_id=eero_id,
            action="led_brightness",
            message=(
                f"LED brightness set to {brightness}%."
                if success
                else "Failed to set LED brightness."
            ),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to set LED brightness for eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update LED brightness. Please try again.",
        )
