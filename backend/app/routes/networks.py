"""Network routes for the Eero Dashboard."""

import logging

from eero import EeroClient
from eero.exceptions import EeroAPIException, EeroException
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from ..deps import require_auth
from ..transformers import check_success, extract_data, extract_list, normalize_network

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
        raw_response = await client.get_networks(refresh_cache=refresh)
        networks = extract_list(raw_response, "networks")

        result = []
        for raw_net in networks:
            net = normalize_network(raw_net)
            result.append(
                NetworkSummary(
                    id=net.get("id") or "",
                    name=net.get("name") or "",
                    status=net.get("status") or "unknown",
                    guest_network_enabled=net.get("guest_network_enabled", False),
                    public_ip=net.get("public_ip"),
                    isp_name=net.get("isp_name"),
                )
            )
        return result
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
        raw_network = await client.get_network(network_id, refresh_cache=refresh)
        network = normalize_network(extract_data(raw_network))

        # Get device and eero counts
        raw_devices = await client.get_devices(network_id)
        raw_eeros = await client.get_eeros(network_id)
        devices = extract_list(raw_devices, "devices")
        eeros = extract_list(raw_eeros, "eeros")

        # Format created_at if available
        created_at_str = network.get("created_at")
        if created_at_str and hasattr(created_at_str, "isoformat"):
            created_at_str = created_at_str.isoformat()

        return NetworkDetail(
            id=network.get("id") or network_id,
            name=network.get("name") or "",
            status=network.get("status") or "unknown",
            guest_network_enabled=network.get("guest_network_enabled", False),
            public_ip=network.get("public_ip"),
            isp_name=network.get("isp_name"),
            device_count=len(devices),
            eero_count=len(eeros),
            speed_test=network.get("speed_test"),
            health=network.get("health"),
            settings=network.get("settings"),
            # Additional info
            owner=network.get("owner"),
            display_name=network.get("display_name"),
            network_customer_type=network.get("network_customer_type"),
            premium_status=network.get("premium_status"),
            created_at=created_at_str,
            # Connection
            gateway=network.get("gateway"),
            wan_type=network.get("wan_type"),
            gateway_ip=network.get("gateway_ip"),
            connection_mode=network.get("connection_mode"),
            # Features
            backup_internet_enabled=network.get("backup_internet_enabled", False),
            power_saving=network.get("power_saving", False),
            sqm=network.get("sqm", False),
            upnp=network.get("upnp", False),
            thread=network.get("thread", False),
            band_steering=network.get("band_steering", False),
            wpa3=network.get("wpa3", False),
            ipv6_upstream=network.get("ipv6_upstream", False),
            # DNS
            dns=network.get("dns"),
            premium_dns=network.get("premium_dns"),
            # Geo IP
            geo_ip=network.get("geo_ip"),
            # Updates
            updates=network.get("updates"),
            # DHCP
            dhcp=network.get("dhcp"),
            # DDNS
            ddns=network.get("ddns"),
            # HomeKit
            homekit=network.get("homekit"),
            # IP Settings
            ip_settings=network.get("ip_settings"),
            # Premium
            premium_details=network.get("premium_details"),
            # Integrations
            amazon_account_linked=network.get("amazon_account_linked", False),
            alexa_skill=network.get("alexa_skill", False),
            # Timestamps
            last_reboot=network.get("last_reboot"),
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
        raw_result = await client.run_speed_test(network_id)
        result = extract_data(raw_result)
        return SpeedTestResult(
            download_mbps=result.get("down", {}).get("value"),
            upload_mbps=result.get("up", {}).get("value"),
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
        raw_result = await client.set_guest_network(
            enabled=enabled,
            name=name,
            network_id=network_id,
        )
        success = check_success(raw_result)
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
