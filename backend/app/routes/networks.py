"""Network routes for the Eero Dashboard."""

import ipaddress
import logging
from datetime import UTC, datetime, timedelta
from typing import Literal

from eero import EeroClient
from eero.exceptions import EeroException
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..deps import require_auth
from ..transformers import (
    check_success,
    extract_data,
    extract_list,
    is_unsafe_short_text,
    normalize_device,
    normalize_dhcp,
    normalize_dns,
    normalize_eero,
    normalize_network,
    normalize_speed_test,
)
from .auth import limiter

router = APIRouter()
_LOGGER = logging.getLogger(__name__)

# In-flight speed-test guard (security review finding, 2026-09-24): the last
# time a speed test was started per network, so a second POST within the
# same run does not pile another test on top of one still completing.
# Process-local and in-memory by design - a restart simply forgets it,
# which is fine for a soft anti-pile-up guard, not a correctness boundary.
_SPEEDTEST_IN_PROGRESS_WINDOW_S = 90
_last_speed_test_started: dict[str, datetime] = {}


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
    """Speed test result.

    Single normalised shape shared by the synchronous ``POST .../speedtest``
    response and the ``GET .../speedtests`` history list.
    """

    download_mbps: float | None = None
    upload_mbps: float | None = None
    latency_ms: float | None = None
    timestamp: str | None = None


def _speed_test_result_model(raw: dict) -> SpeedTestResult:
    """Build a SpeedTestResult from one raw get_speed_tests entry."""
    normalized = normalize_speed_test(raw)
    return SpeedTestResult(
        download_mbps=normalized["down_mbps"],
        upload_mbps=normalized["up_mbps"],
        latency_ms=normalized["latency_ms"],
        timestamp=normalized["date"],
    )


class SpeedTestStartedResponse(BaseModel):
    """Response body for the fire-and-forget speed-test kickoff."""

    status: str = "started"
    started_at: str


class NetworkRenameRequest(BaseModel):
    """Request body for renaming a network."""

    name: str

    class Config:
        extra = "ignore"


# Matches the eero mobile app's own network-name cap (security review
# finding, 2026-09-24) - kept alongside the no-op guard so an oversized or
# control-character name is rejected before the read-first round trip.
_NETWORK_NAME_MAX_BYTES = 32


def _reject_unsafe_name(name: str) -> None:
    """Reject a network name that is oversized or carries control/formatting
    characters, before any network round trip.

    Raises:
        HTTPException: 422 with a static detail - never echoes the offending
            value or its specific defect back to the caller.
    """
    if is_unsafe_short_text(name, max_bytes=_NETWORK_NAME_MAX_BYTES):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Network name is invalid.",
        )


@router.get("", response_model=list[NetworkSummary])
async def list_networks(
    client: EeroClient = Depends(require_auth),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> list[NetworkSummary]:
    """Get list of all networks."""
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


@router.get("/{network_id}", response_model=NetworkDetail)
async def get_network(
    network_id: str,
    client: EeroClient = Depends(require_auth),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> NetworkDetail:
    """Get detailed information about a specific network."""
    raw_network = await client.get_network(network_id, refresh_cache=refresh)
    network = normalize_network(extract_data(raw_network))

    # Get device and eero counts (only count connected devices)
    # Use normalized devices to match dashboard count
    raw_devices = await client.get_devices(network_id)
    raw_eeros = await client.get_eeros(network_id)
    raw_device_list = extract_list(raw_devices, "devices")
    eeros = extract_list(raw_eeros, "eeros")

    # Normalize devices and count connected ones
    normalized_devices = [normalize_device(d) for d in raw_device_list]
    connected_device_count = len([d for d in normalized_devices if d.get("connected")])

    # Find gateway eero location
    normalized_eeros = [normalize_eero(e) for e in eeros]
    gateway_eero = next((e for e in normalized_eeros if e.get("is_gateway")), None)
    gateway_location = gateway_eero.get("location") if gateway_eero else None

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
        device_count=connected_device_count,
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
        gateway=network.get("gateway") or gateway_location,
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
        # DHCP - normalize to frontend-expected format
        dhcp=normalize_dhcp(network.get("dhcp")),
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


@router.post("/{network_id}/set-preferred")
async def set_preferred_network(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> dict:
    """Set the preferred network for subsequent operations."""
    try:
        client.set_preferred_network(network_id)
    except EeroException as e:
        _LOGGER.error(f"Failed to set preferred network {network_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set preferred network. Please try again.",
        )
    return {"success": True, "preferred_network_id": network_id}


@router.post(
    "/{network_id}/speedtest",
    response_model=SpeedTestStartedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.shared_limit("2/minute", scope="speedtest")
async def run_speed_test(
    request: Request,
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> SpeedTestStartedResponse | JSONResponse:
    """Kick off a speed test on the network. Fire-and-forget (§ 9, decision 4).

    The eero cloud API accepts this write with ``data: null`` (v8; see
    phase-6.0-revamp.md § 3.3) and completes the test out of band, on its
    own schedule. This route only starts it and returns immediately with
    202 - it does not block waiting for a result. The frontend reads the
    completed result from ``GET .../speedtests`` (polling that endpoint
    with ``limit=1`` and comparing ``timestamp`` against ``started_at``).

    Rate limited to 2/minute per IP, plus a per-network in-flight guard
    (security review, 2026-09-24): a second call for the same network
    within 90 seconds of the last one is rejected with 409 rather than
    piling another speed test on top of one still running.
    """
    now = datetime.now(UTC)
    last_started = _last_speed_test_started.get(network_id)
    if last_started is not None and now - last_started < timedelta(
        seconds=_SPEEDTEST_IN_PROGRESS_WINDOW_S
    ):
        # Returned directly as a JSONResponse (bypassing response_model) so
        # the body is exactly {"detail", "type"} at the top level, matching
        # the shape of every other typed-error response in this API.
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "A speed test was started less than 90 seconds ago.",
                "type": "speedtest_in_progress",
            },
        )

    started_at = now.isoformat()
    await client.run_speed_test(network_id=network_id)
    _last_speed_test_started[network_id] = now
    return SpeedTestStartedResponse(status="started", started_at=started_at)


@router.get("/{network_id}/speedtests", response_model=list[SpeedTestResult])
async def get_speed_test_history(
    network_id: str,
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results"),
    client: EeroClient = Depends(require_auth),
) -> list[SpeedTestResult]:
    """Get past speed test results for a network, most recent first."""
    raw_response = await client.get_speed_tests(network_id=network_id, limit=limit)
    results = extract_list(raw_response, "speedtest")
    return [_speed_test_result_model(r) for r in results if isinstance(r, dict)]


@router.put("/{network_id}/guest-network")
async def toggle_guest_network(
    network_id: str,
    enabled: bool = Query(..., description="Enable or disable guest network"),
    name: str | None = Query(None, description="Guest network name"),
    client: EeroClient = Depends(require_auth),
) -> dict:
    """Enable or disable the guest network."""
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


class DnsFamilyState(BaseModel):
    """Normalized DNS state for a single address family."""

    mode: Literal["custom", "automatic"]
    servers: list[str] = []


class DnsProvider(BaseModel):
    """A single entry from the API's DNS test-server catalogue."""

    name: str | None = None
    ipv4: list[str] = []
    ipv6: list[str] = []


class DnsSettings(BaseModel):
    """Normalized DNS settings for a network. Shared contract with the frontend."""

    ipv4: DnsFamilyState
    ipv6: DnsFamilyState
    caching: bool = False
    parent_ips: list[str] = []
    providers: list[DnsProvider] = []


class DnsFamilyUpdate(BaseModel):
    """Requested DNS state for a single address family."""

    mode: Literal["custom", "automatic"]
    servers: list[str] = []

    class Config:
        extra = "ignore"


class DnsUpdateRequest(BaseModel):
    """Request body for updating DNS settings.

    A family left as ``None`` is untouched by the update - it is not
    equivalent to an empty/automatic request for that family.
    """

    ipv4: DnsFamilyUpdate | None = None
    ipv6: DnsFamilyUpdate | None = None
    caching: bool | None = None

    class Config:
        extra = "ignore"


class DnsUpdateResponse(BaseModel):
    """Response body for a DNS update."""

    success: bool
    changed: bool
    dns: DnsSettings


def _parse_family_servers(
    field: Literal["ipv4", "ipv6"], servers: list[str]
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Validate DNS server literals for one address family.

    Mirrors the SDK's own validation (``eero.api.dns._validate_servers``) so
    malformed input is rejected with a 400 before any network round trip,
    instead of surfacing later as a less specific SDK error.

    Args:
        field: "ipv4" or "ipv6" - the family this list was submitted under.
        servers: Candidate DNS server address strings.

    Returns:
        Parsed, validated IP address objects, in the order supplied.

    Raises:
        HTTPException: 400 if the list is too long or any entry is not a
            valid, correctly-versioned IP literal.
    """
    expected_version = 4 if field == "ipv4" else 6
    if len(servers) > 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most 2 {field} DNS servers are supported (got {len(servers)})",
        )

    parsed: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for entry in servers:
        candidate = entry.strip() if isinstance(entry, str) else ""
        if not candidate or "%" in candidate:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{entry!r} is not a valid {field} DNS server address",
            )
        try:
            address = ipaddress.ip_address(candidate)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{entry!r} is not a valid IP address",
            )
        if address.version != expected_version:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{entry!r} is an IPv{address.version} address but was "
                    f"submitted in the {field} field"
                ),
            )
        parsed.append(address)
    return parsed


@router.get("/{network_id}/dns", response_model=DnsSettings)
async def get_dns(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> DnsSettings:
    """Get DNS configuration for a network."""
    raw_response = await client.get_dns_settings(network_id)
    raw_network = extract_data(raw_response)
    return DnsSettings(**normalize_dns(raw_network))


@router.put("/{network_id}/dns", response_model=DnsUpdateResponse)
async def update_dns(
    network_id: str,
    body: DnsUpdateRequest,
    client: EeroClient = Depends(require_auth),
) -> DnsUpdateResponse:
    """Update DNS settings for a network.

    A DNS write reboots every eero on the network (see ``eero.api.dns``), so
    this route reads the current configuration first and skips the write
    entirely when nothing would actually change. IPv6 addresses are compared
    as parsed `ipaddress` objects, never as strings, because the API stores
    them fully expanded: a value written as "2606:4700:4700::1111" reads back
    as "2606:4700:4700:0:0:0:0:1111", and a naive string comparison would
    falsely report a change (and reboot the mesh) on every read-modify-write
    cycle.
    """
    if body.ipv4 is None and body.ipv6 is None and body.caching is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of ipv4, ipv6, or caching must be provided",
        )

    # 1. Syntactic validation first - reject malformed input before any
    # network round trip. Only meaningful for mode="custom" with servers
    # supplied; "automatic" and mode-only re-enable are resolved below once
    # we know the currently-stored servers.
    parsed_requests: dict[str, list[ipaddress.IPv4Address | ipaddress.IPv6Address]] = {}
    for field, update in (("ipv4", body.ipv4), ("ipv6", body.ipv6)):
        if update is not None and update.mode == "custom" and update.servers:
            parsed_requests[field] = _parse_family_servers(field, update.servers)

    # 2. Read current state - required for the no-op guard and to resolve a
    # mode-only "custom" re-enable (empty servers) to concrete addresses.
    raw_response = await client.get_dns_settings(network_id)
    current_dns = normalize_dns(extract_data(raw_response))

    custom_writes: dict[str, list[str]] = {}
    clear_families: list[str] = []

    for field, update in (("ipv4", body.ipv4), ("ipv6", body.ipv6)):
        if update is None:
            continue

        current_mode = current_dns[field]["mode"]
        current_servers = current_dns[field]["servers"]
        current_addresses = [ipaddress.ip_address(s) for s in current_servers]

        if update.mode == "custom":
            if update.servers:
                target_addresses = parsed_requests[field]
            else:
                if not current_addresses:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"No custom {field} servers are currently stored to "
                            "re-enable; supply servers explicitly"
                        ),
                    )
                target_addresses = current_addresses

            if current_mode != "custom" or target_addresses != current_addresses:
                custom_writes[field] = [str(a) for a in target_addresses]
        else:
            if current_mode != "automatic":
                clear_families.append(field)

    caching_changed = (
        body.caching is not None and body.caching != current_dns["caching"]
    )

    if not custom_writes and not clear_families and not caching_changed:
        return DnsUpdateResponse(
            success=True, changed=False, dns=DnsSettings(**current_dns)
        )

    _LOGGER.warning(
        "Applying DNS changes for network %s - this reboots every eero on "
        "the network and interrupts client connectivity",
        network_id,
    )

    # Dispatch the narrowest SDK call(s) that express the change. Each
    # write is a separate reboot risk, so families sharing the same
    # target action (both -> custom, or both -> automatic) are combined
    # into a single PUT; otherwise each changed family gets its own
    # targeted call, leaving the untouched family alone. Any
    # EeroValidationException/EeroException here is handled identically by
    # the global handlers registered in main.py (phase-6.0-revamp.md § 3.4),
    # so there is no route-local re-wrap left to do.
    if "ipv4" in custom_writes and "ipv6" in custom_writes:
        combined = custom_writes["ipv4"] + custom_writes["ipv6"]
        await client.set_custom_dns(combined, network_id=network_id)
    elif "ipv4" in custom_writes:
        await client.set_custom_dns_ipv4(custom_writes["ipv4"], network_id=network_id)
    elif "ipv6" in custom_writes:
        await client.set_custom_dns_ipv6(custom_writes["ipv6"], network_id=network_id)

    if len(clear_families) == 2:
        await client.clear_custom_dns(family=None, network_id=network_id)
    elif len(clear_families) == 1:
        await client.clear_custom_dns(family=clear_families[0], network_id=network_id)

    if caching_changed:
        await client.set_dns_caching(body.caching, network_id=network_id)

    # 3. Re-read so the response reflects what the API actually stored,
    # falling back to a projected view if the follow-up read fails - the
    # write itself already succeeded.
    try:
        final_raw = await client.get_dns_settings(network_id)
        final_dns = normalize_dns(extract_data(final_raw))
    except EeroException:
        final_dns = dict(current_dns)
        if "ipv4" in custom_writes:
            final_dns["ipv4"] = {"mode": "custom", "servers": custom_writes["ipv4"]}
        if "ipv6" in custom_writes:
            final_dns["ipv6"] = {"mode": "custom", "servers": custom_writes["ipv6"]}
        for family in clear_families:
            final_dns[family] = {
                "mode": "automatic",
                "servers": current_dns[family]["servers"],
            }
        if caching_changed:
            final_dns["caching"] = body.caching

    return DnsUpdateResponse(success=True, changed=True, dns=DnsSettings(**final_dns))


@router.put("/{network_id}/name")
async def rename_network(
    network_id: str,
    body: NetworkRenameRequest,
    client: EeroClient = Depends(require_auth),
) -> dict:
    """Rename a network. Routed via /networks/{id}/settings (fixed in eero-api 4.1.2).

    ``set_network_name`` is a settings-class write (phase-6.0-revamp.md § 5,
    decision 5): assumed to reboot every eero on the network, exactly like a
    DNS write. This route therefore follows the same read-first, parsed
    no-op guard pattern as ``update_dns`` and skips the write entirely when
    the requested name (stripped) already matches the stored name.
    """
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Network name cannot be empty",
        )
    _reject_unsafe_name(new_name)

    raw_network = await client.get_network(network_id)
    current_name = (
        normalize_network(extract_data(raw_network)).get("name") or ""
    ).strip()

    if new_name == current_name:
        return {
            "success": True,
            "changed": False,
            "network_id": network_id,
            "name": new_name,
        }

    _LOGGER.warning(
        "Renaming network %s - this is treated as a mesh reboot (decision 5)",
        network_id,
    )
    raw_result = await client.set_network_name(new_name, network_id=network_id)
    success = check_success(raw_result)
    return {
        "success": success,
        "changed": True,
        "network_id": network_id,
        "name": new_name,
    }
