"""Eero node routes for the Eero Dashboard."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from eero import EeroClient
from eero.exceptions import EeroException

from ..deps import get_network_id, require_auth

router = APIRouter()
_LOGGER = logging.getLogger(__name__)


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
    state: str | None = None  # ONLINE, OFFLINE, etc.
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
        eeros = await client.get_eeros(network_id, refresh_cache=refresh)

        result = []
        for eero in eeros:
            # Extract eero ID from URL
            eero_id = eero.url.split("/")[-1] if eero.url else eero.serial

            # Handle location as string or Location object
            location = None
            if eero.location:
                if isinstance(eero.location, str):
                    location = eero.location
                elif hasattr(eero.location, "address"):
                    location = eero.location.address

            result.append(
                EeroSummary(
                    id=eero_id,
                    url=eero.url,
                    serial=eero.serial,
                    mac_address=eero.mac_address,
                    model=eero.model,
                    status=eero.status,
                    location=location,
                    is_gateway=eero.is_gateway or eero.gateway,
                    is_primary=eero.is_primary or eero.is_primary_node,
                    connected_clients_count=eero.connected_clients_count,
                    firmware_version=eero.firmware_version or eero.os_version,
                    ip_address=eero.ip_address,
                    mesh_quality_bars=eero.mesh_quality_bars,
                    led_on=eero.led_on,
                    wired=eero.wired,
                )
            )

        return result
    except EeroException as e:
        _LOGGER.error(f"Failed to get eeros: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
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
        eero = await client.get_eero(eero_id, network_id, refresh_cache=refresh)

        eero_id_extracted = eero.url.split("/")[-1] if eero.url else eero.serial

        # Handle location as string or Location object
        location = None
        if eero.location:
            if isinstance(eero.location, str):
                location = eero.location
            elif hasattr(eero.location, "address"):
                location = eero.location.address

        # Extract ethernet port info
        ethernet_ports = None
        if eero.ethernet_status and hasattr(eero.ethernet_status, "statuses") and eero.ethernet_status.statuses:
            ethernet_ports = []
            for port_status in eero.ethernet_status.statuses:
                port_info = {
                    "port_name": port_status.port_name,
                    "interface_number": port_status.interfaceNumber,
                    "has_carrier": port_status.hasCarrier,
                    "speed": port_status.speed,
                    "is_wan_port": port_status.isWanPort,
                    "is_lte": port_status.isLte,
                }
                # Add neighbor info if available
                if port_status.neighbor and port_status.neighbor.metadata:
                    port_info["neighbor_location"] = port_status.neighbor.metadata.location
                    port_info["neighbor_port"] = port_status.neighbor.metadata.port_name
                ethernet_ports.append(port_info)

        # Format last_heartbeat
        last_heartbeat = None
        if eero.last_heartbeat:
            if isinstance(eero.last_heartbeat, str):
                last_heartbeat = eero.last_heartbeat
            else:
                last_heartbeat = eero.last_heartbeat.isoformat()

        # Extract network info
        network_name = None
        network_url = None
        if hasattr(eero, "network") and eero.network:
            network_name = getattr(eero.network, "name", None)
            network_url = getattr(eero.network, "url", None)

        # Extract bssids_with_bands
        bssids_with_bands = None
        if hasattr(eero, "bssids_with_bands") and eero.bssids_with_bands:
            bssids_with_bands = [
                {"band": b.band, "ethernet_address": b.ethernet_address}
                if hasattr(b, "band") else b
                for b in eero.bssids_with_bands
            ]

        # Extract IPv6 addresses
        ipv6_addresses = None
        if hasattr(eero, "ipv6_addresses") and eero.ipv6_addresses:
            ipv6_addresses = [
                {
                    "address": getattr(addr, "address", str(addr)),
                    "scope": getattr(addr, "scope", None),
                    "interface": getattr(addr, "interface", None),
                }
                for addr in eero.ipv6_addresses
            ]

        # Extract organization info
        organization_name = None
        organization_id = None
        if hasattr(eero, "organization") and eero.organization:
            organization_name = getattr(eero.organization, "name", None)
            organization_id = getattr(eero.organization, "id", None)

        # Extract power info
        power_source = None
        if hasattr(eero, "power_info") and eero.power_info:
            power_source = getattr(eero.power_info, "power_source", None)

        # Extract power saving info
        power_saving_active = None
        if hasattr(eero, "power_saving") and eero.power_saving:
            if hasattr(eero.power_saving, "schedule"):
                power_saving_active = getattr(eero.power_saving.schedule, "active", None)

        return EeroDetail(
            id=eero_id_extracted,
            url=eero.url,
            serial=eero.serial,
            mac_address=eero.mac_address,
            model=eero.model,
            model_number=eero.model_number,
            status=eero.status,
            state=getattr(eero, "state", None),
            location=location,
            is_gateway=eero.is_gateway or eero.gateway,
            is_primary=eero.is_primary or eero.is_primary_node,
            wired=eero.wired,
            connection_type=eero.connection_type,
            mesh_quality_bars=eero.mesh_quality_bars,
            ip_address=eero.ip_address,
            using_wan=getattr(eero, "using_wan", None),
            connected_clients_count=eero.connected_clients_count,
            connected_wired_clients_count=eero.connected_wired_clients_count,
            connected_wireless_clients_count=eero.connected_wireless_clients_count,
            firmware_version=eero.firmware_version,
            os_version=eero.os_version or eero.os,
            led_on=eero.led_on,
            led_brightness=eero.led_brightness,
            uptime=eero.uptime,
            cpu_usage=eero.cpu_usage,
            memory_usage=eero.memory_usage,
            temperature=eero.temperature,
            heartbeat_ok=eero.heartbeat_ok,
            update_available=eero.update_available,
            provides_wifi=eero.provides_wifi,
            auto_provisioned=getattr(eero, "auto_provisioned", None),
            retrograde_capable=getattr(eero, "retrograde_capable", None),
            last_heartbeat=last_heartbeat,
            last_reboot=eero.last_reboot,
            joined=eero.joined,
            network_name=network_name,
            network_url=network_url,
            bands=eero.bands,
            wifi_bssids=getattr(eero, "wifi_bssids", None),
            bssids_with_bands=bssids_with_bands,
            ethernet_addresses=eero.ethernet_addresses,
            ethernet_ports=ethernet_ports,
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
    """Reboot an Eero node.

    This will temporarily disconnect all devices connected to this node.
    The reboot typically takes 2-5 minutes.
    """
    try:
        success = await client.reboot_eero(eero_id, network_id=network_id)
        return EeroAction(
            success=success,
            eero_id=eero_id,
            action="reboot",
            message="Reboot initiated. The eero will be back online in a few minutes."
            if success
            else "Failed to initiate reboot.",
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to reboot eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
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
        success = await client.set_led(eero_id, enabled=enabled, network_id=network_id)
        action = "led_on" if enabled else "led_off"
        return EeroAction(
            success=success,
            eero_id=eero_id,
            action=action,
            message=f"LED {'turned on' if enabled else 'turned off'}."
            if success
            else "Failed to change LED state.",
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to set LED for eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
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
        success = await client.set_led_brightness(
            eero_id, brightness=brightness, network_id=network_id
        )
        return EeroAction(
            success=success,
            eero_id=eero_id,
            action="led_brightness",
            message=f"LED brightness set to {brightness}%."
            if success
            else "Failed to set LED brightness.",
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to set LED brightness for eero {eero_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
