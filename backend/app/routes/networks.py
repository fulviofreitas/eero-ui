"""Network routes for the Eero Dashboard."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from eero import EeroClient
from eero.exceptions import EeroAPIException, EeroException

from ..deps import get_network_id, require_auth

router = APIRouter()
_LOGGER = logging.getLogger(__name__)


class NetworkSummary(BaseModel):
    """Summary of a network."""

    id: str
    name: str
    status: str
    guest_network_enabled: bool = False
    public_ip: str | None = None
    isp_name: str | None = None

    class Config:
        """Pydantic config."""

        extra = "ignore"


class NetworkDetail(NetworkSummary):
    """Detailed network information."""

    device_count: int = 0
    eero_count: int = 0
    speed_test: dict | None = None
    health: dict | None = None
    settings: dict | None = None
    
    # Additional info
    owner: str | None = None
    display_name: str | None = None
    network_customer_type: str | None = None
    premium_status: str | None = None
    created_at: str | None = None
    
    # Connection
    gateway: str | None = None
    wan_type: str | None = None
    gateway_ip: str | None = None
    connection_mode: str | None = None
    
    # Features
    backup_internet_enabled: bool = False
    power_saving: bool = False
    sqm: bool = False
    upnp: bool = False
    thread: bool = False
    band_steering: bool = False
    wpa3: bool = False
    ipv6_upstream: bool = False
    
    # DNS
    dns: dict | None = None
    premium_dns: dict | None = None
    
    # Geo IP
    geo_ip: dict | None = None
    
    # Updates
    updates: dict | None = None
    
    # DHCP
    dhcp: dict | None = None
    
    # DDNS
    ddns: dict | None = None
    
    # HomeKit
    homekit: dict | None = None
    
    # IP Settings
    ip_settings: dict | None = None
    
    # Premium
    premium_details: dict | None = None
    
    # Integrations
    amazon_account_linked: bool = False
    alexa_skill: bool = False
    
    # Timestamps
    last_reboot: str | None = None


class SpeedTestResult(BaseModel):
    """Speed test result."""

    download_mbps: float | None = None
    upload_mbps: float | None = None
    latency_ms: float | None = None
    timestamp: str | None = None


@router.get("", response_model=list[NetworkSummary])
async def list_networks(
    client: EeroClient = Depends(require_auth),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> list[NetworkSummary]:
    """Get list of all networks."""
    try:
        networks = await client.get_networks(refresh_cache=refresh)
        return [
            NetworkSummary(
                id=net.id,
                name=net.name,
                status=str(net.status.value) if hasattr(net.status, "value") else str(net.status),
                guest_network_enabled=net.guest_network_enabled,
                public_ip=net.public_ip,
                isp_name=net.isp_name,
            )
            for net in networks
        ]
    except EeroException as e:
        _LOGGER.error(f"Failed to get networks: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve networks. Please try again.",
        )


@router.get("/{network_id}", response_model=NetworkDetail)
async def get_network(
    network_id: str,
    client: EeroClient = Depends(require_auth),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> NetworkDetail:
    """Get detailed information about a specific network."""
    try:
        network = await client.get_network(network_id, refresh_cache=refresh)

        # Get device and eero counts
        devices = await client.get_devices(network_id)
        eeros = await client.get_eeros(network_id)

        status_str = str(network.status.value) if hasattr(network.status, "value") else str(network.status)

        # Format created_at if available
        created_at_str = None
        if network.created_at:
            created_at_str = network.created_at.isoformat() if hasattr(network.created_at, 'isoformat') else str(network.created_at)

        return NetworkDetail(
            id=network.id,
            name=network.name,
            status=status_str,
            guest_network_enabled=network.guest_network_enabled,
            public_ip=network.public_ip,
            isp_name=network.isp_name,
            device_count=len(devices),
            eero_count=len(eeros),
            speed_test=network.speed_test,
            health=network.health,
            settings=network.settings.model_dump() if network.settings else None,
            # Additional info
            owner=getattr(network, 'owner', None),
            display_name=getattr(network, 'display_name', None),
            network_customer_type=getattr(network, 'network_customer_type', None),
            premium_status=getattr(network, 'premium_status', None),
            created_at=created_at_str,
            # Connection
            gateway=getattr(network, 'gateway', None),
            wan_type=getattr(network, 'wan_type', None),
            gateway_ip=getattr(network, 'gateway_ip', None),
            connection_mode=getattr(network, 'connection_mode', None),
            # Features
            backup_internet_enabled=getattr(network, 'backup_internet_enabled', False),
            power_saving=getattr(network, 'power_saving', False),
            sqm=getattr(network, 'sqm', False),
            upnp=getattr(network, 'upnp', False),
            thread=getattr(network, 'thread', False),
            band_steering=getattr(network, 'band_steering', False),
            wpa3=getattr(network, 'wpa3', False),
            ipv6_upstream=getattr(network, 'ipv6_upstream', False),
            # DNS
            dns=getattr(network, 'dns', None),
            premium_dns=getattr(network, 'premium_dns', None),
            # Geo IP
            geo_ip=getattr(network, 'geo_ip', None),
            # Updates
            updates=getattr(network, 'updates', None),
            # DHCP
            dhcp=network.dhcp.model_dump() if network.dhcp else None,
            # DDNS
            ddns=getattr(network, 'ddns', None),
            # HomeKit
            homekit=getattr(network, 'homekit', None),
            # IP Settings
            ip_settings=getattr(network, 'ip_settings', None),
            # Premium
            premium_details=getattr(network, 'premium_details', None),
            # Integrations
            amazon_account_linked=getattr(network, 'amazon_account_linked', False),
            alexa_skill=getattr(network, 'alexa_skill', False),
            # Timestamps
            last_reboot=getattr(network, 'last_reboot', None),
        )
    except EeroException as e:
        _LOGGER.error(f"Failed to get network {network_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Network not found: {network_id}",
        )


@router.post("/{network_id}/set-preferred")
async def set_preferred_network(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> dict:
    """Set the preferred network for subsequent operations."""
    client.set_preferred_network(network_id)
    return {"success": True, "preferred_network_id": network_id}


@router.post("/{network_id}/speedtest", response_model=SpeedTestResult)
async def run_speed_test(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> SpeedTestResult:
    """Run a speed test on the network.

    Note: This can take 30-60 seconds to complete.
    """
    try:
        result = await client.run_speed_test(network_id)
        return SpeedTestResult(
            download_mbps=result.get("download", {}).get("value"),
            upload_mbps=result.get("upload", {}).get("value"),
            latency_ms=result.get("latency"),
            timestamp=result.get("date"),
        )
    except EeroAPIException as e:
        _LOGGER.error(f"Speed test failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Speed test failed. Please try again later.",
        )


@router.put("/{network_id}/guest-network")
async def toggle_guest_network(
    network_id: str,
    enabled: bool = Query(..., description="Enable or disable guest network"),
    name: str | None = Query(None, description="Guest network name"),
    client: EeroClient = Depends(require_auth),
) -> dict:
    """Enable or disable the guest network."""
    try:
        success = await client.set_guest_network(
            enabled=enabled,
            name=name,
            network_id=network_id,
        )
        return {
            "success": success,
            "guest_network_enabled": enabled,
        }
    except EeroException as e:
        _LOGGER.error(f"Failed to toggle guest network: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update guest network settings. Please try again.",
        )
