"""Network routes for the Eero Dashboard."""

import ipaddress
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from eero import EeroClient
from eero.exceptions import (
    EeroAccessDeniedException,
    EeroException,
    EeroNotFoundException,
)
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .._coercion import coerce_bool
from ..config import settings
from ..deps import require_auth
from ..transformers import (
    check_success,
    extract_data,
    extract_list,
    is_unsafe_short_text,
    is_valid_iso8601,
    is_valid_mac,
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


def _prune_stale_speedtest_entries(now: datetime) -> None:
    """Drop in-flight speed-test guard entries older than the window.

    ``_last_speed_test_started`` is unbounded today (phase-6.0-revamp.md
    WP6 deliverable 2): a long-running process accumulates one entry per
    network ever probed and never forgets it. Called on every access to
    the dict so it never grows past the number of networks that started a
    speed test within the last 90 seconds.
    """
    stale = [
        net_id
        for net_id, started in _last_speed_test_started.items()
        if now - started >= timedelta(seconds=_SPEEDTEST_IN_PROGRESS_WINDOW_S)
    ]
    for net_id in stale:
        del _last_speed_test_started[net_id]


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
    _prune_stale_speedtest_entries(now)
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
    start_time: str | None = Query(None, description="ISO-8601 lower bound"),
    end_time: str | None = Query(None, description="ISO-8601 upper bound"),
    client: EeroClient = Depends(require_auth),
) -> list[SpeedTestResult]:
    """Get past speed test results for a network, most recent first."""
    for field, value in (("start_time", start_time), ("end_time", end_time)):
        if value is not None and not is_valid_iso8601(value):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field} must be an ISO-8601 timestamp.",
            )
    _prune_stale_speedtest_entries(datetime.now(UTC))
    raw_response = await client.get_speed_tests(
        network_id=network_id, limit=limit, start_time=start_time, end_time=end_time
    )
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


class GuestNetworkStatus(BaseModel):
    """Normalized guest network configuration (phase-6.0-revamp.md WP6).

    The eero cloud API's guest-network payload never includes the raw
    password - only whether one is currently set - so ``has_password`` is
    reported instead of forwarding any password material.
    """

    enabled: bool = False
    name: str | None = None
    has_password: bool = False

    class Config:
        extra = "ignore"


def _normalize_guest_network(data: dict[str, Any]) -> GuestNetworkStatus:
    return GuestNetworkStatus(
        enabled=bool(coerce_bool(data.get("enabled"))),
        name=data.get("name"),
        has_password=bool(data.get("password") or data.get("has_password")),
    )


@router.get("/{network_id}/guest", response_model=GuestNetworkStatus)
async def get_guest_network(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> GuestNetworkStatus:
    """Get guest network configuration."""
    raw = await client.get_guest_network(network_id=network_id)
    return _normalize_guest_network(extract_data(raw))


class GuestPasswordRequest(BaseModel):
    """Request body for setting the guest network password."""

    password: str

    class Config:
        extra = "ignore"


class GuestPasswordResponse(BaseModel):
    """Response body for a guest-password write, with a read-back."""

    success: bool
    guest_network: GuestNetworkStatus


_GUEST_PASSWORD_MIN = 8
_GUEST_PASSWORD_MAX = 63


def _reject_unsafe_guest_password(password: str) -> None:
    """Reject a guest password outside the 8-63 printable-ASCII contract.

    Raises:
        HTTPException: 422 with a static detail.
    """
    if not (_GUEST_PASSWORD_MIN <= len(password) <= _GUEST_PASSWORD_MAX):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Guest password must be {_GUEST_PASSWORD_MIN}-"
                f"{_GUEST_PASSWORD_MAX} characters."
            ),
        )
    if not all(0x20 <= ord(c) < 0x7F for c in password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Guest password must be printable ASCII.",
        )


@router.put("/{network_id}/guest/password", response_model=GuestPasswordResponse)
async def set_guest_password_route(
    network_id: str,
    body: GuestPasswordRequest,
    client: EeroClient = Depends(require_auth),
) -> GuestPasswordResponse:
    """Set the guest network password.

    Verified write (sdk-surface-map-v8.0.3.md WP6 allowlist); disconnects
    guest clients while it takes effect. Never retried on failure.
    """
    _reject_unsafe_guest_password(body.password)
    raw_result = await client.set_guest_password(body.password, network_id=network_id)
    success = check_success(raw_result)
    raw_guest = await client.get_guest_network(network_id=network_id)
    return GuestPasswordResponse(
        success=success,
        guest_network=_normalize_guest_network(extract_data(raw_guest)),
    )


@router.delete("/{network_id}/guest/password", response_model=GuestPasswordResponse)
async def clear_guest_password_route(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> GuestPasswordResponse:
    """Clear the guest network password.

    Verified write (sdk-surface-map-v8.0.3.md WP6 allowlist); disconnects
    guest clients while it takes effect. Never retried on failure.
    """
    raw_result = await client.clear_guest_password(network_id=network_id)
    success = check_success(raw_result)
    raw_guest = await client.get_guest_network(network_id=network_id)
    return GuestPasswordResponse(
        success=success,
        guest_network=_normalize_guest_network(extract_data(raw_guest)),
    )


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


# ---------------------------------------------------------------------------
# Entitlements (phase-6.0-revamp.md WP6, deliverable 1) - gates every
# premium-only card in the UI. Each source is read independently and fails
# soft to None/[] on that source's own error; a denied source never fails
# the whole route.
# ---------------------------------------------------------------------------


class PremiumStatus(BaseModel):
    """Minimal, normalized view of the network's premium status."""

    active: bool | None = None
    eero_plus: Any = None
    premium_dns: bool | None = None


class NetworkEntitlements(BaseModel):
    """Per-network entitlements and premium status.

    ``features`` and ``upsell_features`` elements are passed through
    unchanged - their shape is undocumented in eero-api v8.0.3
    (sdk-surface-map-v8.0.3.md WP6: "element shape undocumented and
    unfixtured ([] only) - take from a live read").
    """

    features: list[Any] = []
    upsell_features: list[Any] = []
    is_premium: bool | None = None
    premium_status: PremiumStatus | None = None
    capabilities: list[Any] = []
    experimental_writes: bool


@router.get("/{network_id}/entitlements", response_model=NetworkEntitlements)
async def get_entitlements(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> NetworkEntitlements:
    """Get the network's entitled/upsell features, premium status and
    model capabilities, plus the ``EERO_DASHBOARD_EXPERIMENTAL_WRITES``
    flag so one call configures every premium-gated and unverified-write
    control in the UI (mirrors ``/api/health``, decision 6a).
    """
    features: list[Any] = []
    upsell_features: list[Any] = []
    capabilities: list[Any] = []
    is_premium: bool | None = None
    premium_status: PremiumStatus | None = None

    try:
        raw = await client.get_entitlement_features(network_id=network_id)
        data = extract_data(raw)
        if isinstance(data.get("features"), list):
            features = data["features"]
    except EeroException as e:
        _LOGGER.debug("Entitlement features unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_upsell_features(network_id=network_id)
        data = extract_data(raw)
        if isinstance(data.get("upsell_features"), list):
            upsell_features = data["upsell_features"]
    except EeroException as e:
        _LOGGER.debug("Upsell features unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_model_capabilities(network_id=network_id)
        data = extract_data(raw)
        if isinstance(data.get("models"), list):
            capabilities = data["models"]
    except EeroException as e:
        _LOGGER.debug("Model capabilities unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_premium_customer()
        data = extract_data(raw)
        if "is_premium" in data:
            is_premium = bool(coerce_bool(data.get("is_premium")))
    except EeroException as e:
        _LOGGER.debug("Premium customer record unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_premium_status(network_id=network_id)
        data = extract_data(raw)
        raw_status = data.get("premium_status")
        if isinstance(raw_status, dict):
            premium_status = PremiumStatus(
                active=raw_status.get("active"),
                eero_plus=data.get("eero_plus"),
                premium_dns=(
                    bool(coerce_bool(data.get("premium_dns")))
                    if "premium_dns" in data
                    else None
                ),
            )
    except EeroException as e:
        _LOGGER.debug("Premium status unavailable for %s: %s", network_id, e)

    return NetworkEntitlements(
        features=features,
        upsell_features=upsell_features,
        is_premium=is_premium,
        premium_status=premium_status,
        capabilities=capabilities,
        experimental_writes=settings.experimental_writes,
    )


# ---------------------------------------------------------------------------
# Network scan (phase-6.0-revamp.md WP6, deliverable 6)
# ---------------------------------------------------------------------------


class NetworkScanResponse(BaseModel):
    """Channel/neighbour scan result."""

    scan: list[dict[str, Any]] = []


@router.get("/{network_id}/scan", response_model=NetworkScanResponse)
async def get_network_scan(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> NetworkScanResponse:
    """Get the network's channel/neighbour scan result. Verified read."""
    raw = await client.get_network_scan(network_id=network_id)
    return NetworkScanResponse(scan=extract_list(raw, "scan"))


# ---------------------------------------------------------------------------
# Insights (phase-6.0-revamp.md WP6, deliverable 7). Shared by the device-
# and profile-scoped insights routes in routes/devices.py and
# routes/profiles.py.
# ---------------------------------------------------------------------------

INSIGHT_TYPES = {"adblock", "blocked", "inspected"}
INSIGHT_CADENCES = {"daily", "hourly"}
_MAX_INSIGHT_RANGE_DAYS = 31


def validate_insight_params(
    start: str, end: str, insight_type: str, cadence: str
) -> None:
    """Validate the shared query contract for every insights route.

    Raises:
        HTTPException: 400/422 on any violation, before any SDK call.
    """
    if insight_type not in INSIGHT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"insight_type must be one of {sorted(INSIGHT_TYPES)}.",
        )
    if cadence not in INSIGHT_CADENCES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"cadence must be one of {sorted(INSIGHT_CADENCES)}.",
        )
    if not is_valid_iso8601(start) or not is_valid_iso8601(end):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start and end must be ISO-8601 timestamps.",
        )
    start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end must be after start.",
        )
    if end_dt - start_dt > timedelta(days=_MAX_INSIGHT_RANGE_DAYS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Range may not exceed {_MAX_INSIGHT_RANGE_DAYS} days.",
        )


class InsightValue(BaseModel):
    """One time-bucketed value in an insight series."""

    time: str | None = None
    value: float | None = None

    class Config:
        extra = "ignore"


class InsightSeries(BaseModel):
    """One insight series, as returned by every ``get_*insights`` method."""

    insight_type: str | None = None
    sum: float | None = None
    values: list[InsightValue] = []

    class Config:
        extra = "ignore"


class InsightsResponse(BaseModel):
    """Normalized shape shared by network/device/profile insights routes."""

    series: list[InsightSeries] = []


def normalize_insights(raw: Any) -> InsightsResponse:
    """Build an ``InsightsResponse`` from a raw ``get_*insights`` envelope."""
    data = extract_data(raw)
    raw_series = data.get("series")
    series: list[InsightSeries] = []
    if isinstance(raw_series, list):
        for entry in raw_series:
            if not isinstance(entry, dict):
                continue
            raw_values = entry.get("values")
            values = (
                [InsightValue(**v) for v in raw_values if isinstance(v, dict)]
                if isinstance(raw_values, list)
                else []
            )
            series.append(
                InsightSeries(
                    insight_type=entry.get("insight_type"),
                    sum=entry.get("sum"),
                    values=values,
                )
            )
    return InsightsResponse(series=series)


@router.get("/{network_id}/insights", response_model=InsightsResponse)
async def get_network_insights(
    network_id: str,
    start: str = Query(..., description="ISO-8601 window start"),
    end: str = Query(..., description="ISO-8601 window end"),
    insight_type: str = Query(..., description="adblock | blocked | inspected"),
    cadence: str = Query("daily", description="daily | hourly"),
    client: EeroClient = Depends(require_auth),
) -> InsightsResponse:
    """Query the network's insights time series. Premium-gated (402 surfaces)."""
    validate_insight_params(start, end, insight_type, cadence)
    raw = await client.get_insights(
        network_id=network_id,
        start=start,
        end=end,
        insight_type=insight_type,
        cadence=cadence,
    )
    return normalize_insights(raw)


# ---------------------------------------------------------------------------
# Data usage (phase-6.0-revamp.md WP6, deliverable 8). Shape is undocumented
# in eero-api v8.0.3 beyond a raw envelope, so this normalizes only the
# common time/download/upload keys observed on comparable endpoints and
# preserves every other raw key rather than guessing further structure.
# ---------------------------------------------------------------------------

DATA_USAGE_CADENCES = {"daily", "hourly"}


def _validate_usage_window(
    start: str, end: str, cadence: str | None, *, cadence_required: bool
) -> None:
    """Validate the shared start/end/cadence contract for data-usage routes."""
    if not is_valid_iso8601(start) or not is_valid_iso8601(end):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start and end must be ISO-8601 timestamps.",
        )
    if datetime.fromisoformat(end.replace("Z", "+00:00")) <= datetime.fromisoformat(
        start.replace("Z", "+00:00")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end must be after start.",
        )
    if cadence is None:
        if cadence_required:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"cadence is required and must be one of {sorted(DATA_USAGE_CADENCES)}.",
            )
        return
    if cadence not in DATA_USAGE_CADENCES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"cadence must be one of {sorted(DATA_USAGE_CADENCES)}.",
        )


class DataUsageResponse(BaseModel):
    """Best-effort normalized data-usage payload.

    ``download_bytes``/``upload_bytes`` are populated when the raw payload
    carries one of the common key spellings; every other raw key is kept
    under ``extra`` fields rather than discarded, because the exact shape
    is unfixtured upstream (sdk-surface-map-v8.0.3.md WP6).
    """

    download_bytes: float | None = None
    upload_bytes: float | None = None
    values: list[dict[str, Any]] = []

    class Config:
        extra = "allow"


def _normalize_data_usage(raw: Any) -> DataUsageResponse:
    data = extract_data(raw)
    values_raw = data.get("values") or data.get("data_usage") or data.get("usage")
    values: list[dict[str, Any]] = []
    if isinstance(values_raw, list):
        for entry in values_raw:
            if isinstance(entry, dict):
                values.append(entry)
    result = dict(data)
    result["values"] = values
    result["download_bytes"] = (
        data.get("download") or data.get("down") or data.get("download_bytes")
    )
    result["upload_bytes"] = (
        data.get("upload") or data.get("up") or data.get("upload_bytes")
    )
    return DataUsageResponse(**result)


@router.get("/{network_id}/data-usage", response_model=DataUsageResponse)
async def get_data_usage(
    network_id: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str = Query(...),
    timezone: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Network-level data usage. Premium-gated (402 surfaces)."""
    _validate_usage_window(start, end, cadence, cadence_required=True)
    raw = await client.get_data_usage(
        network_id=network_id, start=start, end=end, cadence=cadence, timezone=timezone
    )
    return _normalize_data_usage(raw)


@router.get("/{network_id}/data-usage/breakdown", response_model=DataUsageResponse)
async def get_data_usage_breakdown(
    network_id: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str | None = Query(None),
    timezone: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Data-usage breakdown. Premium-gated (402 surfaces)."""
    _validate_usage_window(start, end, cadence, cadence_required=False)
    raw = await client.get_data_usage_breakdown(
        network_id=network_id, start=start, end=end, cadence=cadence, timezone=timezone
    )
    return _normalize_data_usage(raw)


@router.get("/{network_id}/data-usage/devices", response_model=DataUsageResponse)
async def get_devices_data_usage(
    network_id: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str | None = Query(None),
    timezone: str | None = Query(None),
    profile_id: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Per-device data usage across the network. Premium-gated."""
    _validate_usage_window(start, end, cadence, cadence_required=False)
    raw = await client.get_devices_data_usage(
        network_id=network_id,
        start=start,
        end=end,
        cadence=cadence,
        timezone=timezone,
        profile_id=profile_id,
    )
    return _normalize_data_usage(raw)


@router.get(
    "/{network_id}/data-usage/devices/{device_mac}", response_model=DataUsageResponse
)
async def get_device_data_usage(
    network_id: str,
    device_mac: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str = Query(...),
    timezone: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Data usage for a single device, addressed by MAC. Premium-gated."""
    mac = device_mac.lower()
    if not is_valid_mac(mac):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="device_mac must be a lowercase colon-separated MAC address.",
        )
    _validate_usage_window(start, end, cadence, cadence_required=True)
    raw = await client.get_device_data_usage(
        mac,
        network_id=network_id,
        start=start,
        end=end,
        cadence=cadence,
        timezone=timezone,
    )
    return _normalize_data_usage(raw)


@router.get("/{network_id}/data-usage/eeros/summary", response_model=DataUsageResponse)
async def get_eeros_data_usage_summary(
    network_id: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str = Query(...),
    timezone: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Data-usage summary across every eero on the network. Premium-gated.

    Registered ahead of ``/data-usage/eeros/{eero_id}`` so the literal
    ``summary`` segment is never captured as an eero id.
    """
    _validate_usage_window(start, end, cadence, cadence_required=True)
    raw = await client.get_eeros_data_usage_summary(
        network_id=network_id, start=start, end=end, cadence=cadence, timezone=timezone
    )
    return _normalize_data_usage(raw)


@router.get(
    "/{network_id}/data-usage/eeros/{eero_id}", response_model=DataUsageResponse
)
async def get_eero_data_usage(
    network_id: str,
    eero_id: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str = Query(...),
    timezone: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Data usage for a single eero. Premium-gated."""
    _validate_usage_window(start, end, cadence, cadence_required=True)
    raw = await client.get_eero_data_usage(
        eero_id,
        network_id=network_id,
        start=start,
        end=end,
        cadence=cadence,
        timezone=timezone,
    )
    return _normalize_data_usage(raw)


@router.get(
    "/{network_id}/data-usage/profiles/{profile_id}", response_model=DataUsageResponse
)
async def get_profile_data_usage(
    network_id: str,
    profile_id: str,
    start: str = Query(...),
    end: str = Query(...),
    cadence: str = Query(...),
    timezone: str | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> DataUsageResponse:
    """Data usage for a single profile. Premium-gated."""
    _validate_usage_window(start, end, cadence, cadence_required=True)
    raw = await client.get_profile_data_usage(
        profile_id,
        network_id=network_id,
        start=start,
        end=end,
        cadence=cadence,
        timezone=timezone,
    )
    return _normalize_data_usage(raw)


# ---------------------------------------------------------------------------
# Events + channel utilisation (phase-6.0-revamp.md WP6, deliverable 9)
# ---------------------------------------------------------------------------


class AppEventsResponse(BaseModel):
    """The network's app events, most recent first (as returned by the API)."""

    events: list[dict[str, Any]] = []


@router.get("/{network_id}/events", response_model=AppEventsResponse)
async def get_network_events(
    network_id: str,
    page_size: int | None = Query(None, ge=1, le=200),
    timestamp: str | None = Query(None, description="ISO-8601 pagination cursor"),
    client: EeroClient = Depends(require_auth),
) -> AppEventsResponse:
    """Get the network's app events. Verified read."""
    if timestamp is not None and not is_valid_iso8601(timestamp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="timestamp must be an ISO-8601 timestamp.",
        )
    raw = await client.get_app_events(
        network_id=network_id, page_size=page_size, timestamp=timestamp
    )
    return AppEventsResponse(events=extract_list(raw, "events"))


CHANNEL_UTILIZATION_BANDS = {
    "band_2_4GHz",
    "band_5GHz_low",
    "band_5GHz_high",
    "band_5GHz_full",
    "band_6GHz",
}


@router.get("/{network_id}/channel-utilization")
async def get_channel_utilization(
    network_id: str,
    start: str = Query(...),
    end: str = Query(...),
    band: str | None = Query(None),
    eero_id: int | None = Query(None),
    granularity: int | None = Query(None),
    client: EeroClient = Depends(require_auth),
) -> dict[str, Any]:
    """Wi-Fi channel utilisation series. Verified read; not cached."""
    if not is_valid_iso8601(start) or not is_valid_iso8601(end):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start and end must be ISO-8601 timestamps.",
        )
    if band is not None and band not in CHANNEL_UTILIZATION_BANDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"band must be one of {sorted(CHANNEL_UTILIZATION_BANDS)}.",
        )
    raw = await client.get_channel_utilization(
        network_id=network_id,
        start=start,
        end=end,
        band=band,
        eero_id=eero_id,
        granularity=granularity,
    )
    return extract_data(raw)


# ---------------------------------------------------------------------------
# Permissions / members / invites (phase-6.0-revamp.md WP6, deliverable 10)
# Fail-soft: a 403 from any one of these becomes an empty result with
# partial=True rather than failing the whole route.
# ---------------------------------------------------------------------------


class PermissionsResponse(BaseModel):
    """The current user's permissions on the network."""

    permissions: dict[str, bool] = {}
    role: str | None = None
    partial: bool = False


@router.get("/{network_id}/permissions", response_model=PermissionsResponse)
async def get_network_permissions(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> PermissionsResponse:
    """Get the current user's permissions on the network. Verified read."""
    try:
        raw = await client.get_permissions(network_id=network_id)
    except EeroAccessDeniedException:
        return PermissionsResponse(partial=True)
    data = extract_data(raw)
    permissions = data.get("permissions")
    return PermissionsResponse(
        permissions=permissions if isinstance(permissions, dict) else {},
        role=data.get("role"),
    )


class MembersResponse(BaseModel):
    """The network's members."""

    members: list[dict[str, Any]] = []
    partial: bool = False


@router.get("/{network_id}/members", response_model=MembersResponse)
async def get_network_members(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> MembersResponse:
    """Get the network's members. Verified read."""
    try:
        raw = await client.get_members(network_id=network_id)
    except EeroAccessDeniedException:
        return MembersResponse(partial=True)
    return MembersResponse(members=extract_list(raw, "members"))


class InvitesResponse(BaseModel):
    """The network's pending invites."""

    invites: list[dict[str, Any]] = []
    partial: bool = False


@router.get("/{network_id}/invites", response_model=InvitesResponse)
async def get_network_invites(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> InvitesResponse:
    """Get the network's pending invites.

    Verified read; fails soft to an empty, ``partial: true`` result on the
    403 the SDK's own docs note "some accounts" receive
    (sdk-surface-map-v8.0.3.md WP6).
    """
    try:
        raw = await client.get_invites(network_id=network_id)
    except EeroAccessDeniedException:
        return InvitesResponse(partial=True)
    return InvitesResponse(invites=extract_list(raw, "invites"))


# ---------------------------------------------------------------------------
# Backup internet reads (phase-6.0-revamp.md WP6, deliverable 11)
# ---------------------------------------------------------------------------


class BackupInternetResponse(BaseModel):
    """Backup-internet (cellular failover) status, each field fail-soft."""

    enabled: bool | None = None
    cellular_usage: dict[str, Any] | None = None
    cellular_events: list[dict[str, Any]] | None = None


@router.get("/{network_id}/backup-internet", response_model=BackupInternetResponse)
async def get_backup_internet(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> BackupInternetResponse:
    """Get backup-internet status, cellular usage and cellular events.

    Plus-gated; each of the three sources is read independently and fails
    soft to ``None`` on its own error.
    """
    enabled: bool | None = None
    cellular_usage: dict[str, Any] | None = None
    cellular_events: list[dict[str, Any]] | None = None

    try:
        raw = await client.get_backup_internet(network_id=network_id)
        data = extract_data(raw)
        enabled = bool(coerce_bool(data.get("enabled"))) if "enabled" in data else None
    except EeroException as e:
        _LOGGER.debug("Backup internet status unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_cellular_backup_usage(network_id=network_id)
        cellular_usage = extract_data(raw)
    except EeroException as e:
        _LOGGER.debug("Cellular backup usage unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_cellular_backup_events(network_id=network_id)
        cellular_events = extract_list(raw, "events")
    except EeroException as e:
        _LOGGER.debug("Cellular backup events unavailable for %s: %s", network_id, e)

    return BackupInternetResponse(
        enabled=enabled, cellular_usage=cellular_usage, cellular_events=cellular_events
    )


class BackupAccessPointsResponse(BaseModel):
    """Configured backup Wi-Fi access points."""

    access_points: list[dict[str, Any]] = []


@router.get(
    "/{network_id}/backup-access-points", response_model=BackupAccessPointsResponse
)
async def get_backup_access_points(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> BackupAccessPointsResponse:
    """Get configured backup Wi-Fi access points. Verified read."""
    raw = await client.list_backup_access_points(network_id=network_id)
    return BackupAccessPointsResponse(access_points=extract_list(raw, "access_points"))


# ---------------------------------------------------------------------------
# Security / WAN reads (phase-6.0-revamp.md WP6, deliverable 12)
# ---------------------------------------------------------------------------


class SecuritySettingsResponse(BaseModel):
    """Combined security-related settings, each source fail-soft."""

    wpa3: bool | None = None
    band_steering: bool | None = None
    upnp: bool | None = None
    ipv6: Any = None
    wpa3_per_band: dict[str, Any] | None = None
    fast_transition: dict[str, Any] | None = None
    sqm: bool | None = None
    thread: dict[str, Any] | None = None
    updates: dict[str, Any] | None = None


@router.get("/{network_id}/security", response_model=SecuritySettingsResponse)
async def get_network_security(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> SecuritySettingsResponse:
    """Get combined security settings: WPA3, band steering, UPnP, IPv6,
    per-band WPA3, fast transition, SQM, Thread and pending updates.

    Read-only; each source is fetched independently and fails soft.
    """
    result: dict[str, Any] = {}

    try:
        raw = await client.get_security_settings(network_id=network_id)
        data = extract_data(raw)
        result["wpa3"] = data.get("wpa3")
        result["band_steering"] = data.get("band_steering")
        result["upnp"] = data.get("upnp")
        result["ipv6"] = data.get("ipv6")
    except EeroException as e:
        _LOGGER.debug("Security settings unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_wpa3_per_band(network_id=network_id)
        result["wpa3_per_band"] = extract_data(raw)
    except EeroException as e:
        _LOGGER.debug("WPA3-per-band unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_fast_transition(network_id=network_id)
        result["fast_transition"] = extract_data(raw)
    except EeroException as e:
        _LOGGER.debug("Fast transition unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_sqm_settings(network_id=network_id)
        result["sqm"] = extract_data(raw).get("sqm")
    except EeroException as e:
        _LOGGER.debug("SQM settings unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_thread(network_id=network_id)
        result["thread"] = extract_data(raw)
    except EeroException as e:
        _LOGGER.debug("Thread settings unavailable for %s: %s", network_id, e)

    try:
        raw = await client.get_updates(network_id=network_id)
        result["updates"] = extract_data(raw)
    except EeroException as e:
        _LOGGER.debug("Updates unavailable for %s: %s", network_id, e)

    return SecuritySettingsResponse(**result)


class SubnetsResponse(BaseModel):
    """Configured subnets."""

    subnets: list[dict[str, Any]] = []


@router.get("/{network_id}/subnets", response_model=SubnetsResponse)
async def get_network_subnets(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> SubnetsResponse:
    """Get configured subnets. Verified read."""
    raw = await client.get_subnets_config(network_id=network_id)
    return SubnetsResponse(subnets=extract_list(raw, "subnets"))


class MultiStaticIpResponse(BaseModel):
    """Multi-static-IP WAN configuration, when the feature is present."""

    configured: bool = False
    config: dict[str, Any] | None = None


@router.get("/{network_id}/multistaticip", response_model=MultiStaticIpResponse)
async def get_network_multistaticip(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> MultiStaticIpResponse:
    """Get multi-static-IP WAN configuration.

    404 (``error.network.multistaticip_not_found``) means the feature is
    not configured on this network, not an error - reported as
    ``configured: false`` rather than propagating a 404.
    """
    try:
        raw = await client.get_multistaticip(network_id=network_id)
    except EeroNotFoundException:
        return MultiStaticIpResponse(configured=False)
    return MultiStaticIpResponse(configured=True, config=extract_data(raw))


class AdvancedNetworkSettings(BaseModel):
    """Network-envelope-only settings with no dedicated SDK getter."""

    dhcp: dict[str, Any] | None = None
    connection_mode: str | None = None
    power_saving: Any = None
    ddns: Any = None


@router.get("/{network_id}/advanced", response_model=AdvancedNetworkSettings)
async def get_network_advanced(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> AdvancedNetworkSettings:
    """Get DHCP, connection mode, power saving and DDNS.

    These live only on the network envelope (sdk-surface-map-v8.0.3.md
    WP6: "ABSENT - read from the network envelope"), so this reads
    ``get_network`` rather than a dedicated endpoint.
    """
    raw = await client.get_network(network_id)
    network = normalize_network(extract_data(raw))
    return AdvancedNetworkSettings(
        dhcp=normalize_dhcp(network.get("dhcp")),
        connection_mode=network.get("connection_mode"),
        power_saving=network.get("power_saving"),
        ddns=network.get("ddns"),
    )


# ---------------------------------------------------------------------------
# Notifications reads (phase-6.0-revamp.md WP6, deliverable 13)
# ---------------------------------------------------------------------------


class NotificationsResponse(BaseModel):
    """Notification settings plus the unread flag, each source fail-soft."""

    settings: dict[str, bool] = {}
    has_unread: bool | None = None


@router.get("/{network_id}/notifications", response_model=NotificationsResponse)
async def get_network_notifications(
    network_id: str,
    client: EeroClient = Depends(require_auth),
) -> NotificationsResponse:
    """Get notification settings and the unread flag. Verified reads."""
    settings_data: dict[str, bool] = {}
    has_unread: bool | None = None

    try:
        raw = await client.get_notification_settings(network_id=network_id)
        data = extract_data(raw)
        settings_data = {k: v for k, v in data.items() if isinstance(v, bool)}
    except EeroException as e:
        _LOGGER.debug("Notification settings unavailable for %s: %s", network_id, e)

    try:
        raw = await client.has_unread_notifications(network_id=network_id)
        data = extract_data(raw)
        has_unread = (
            bool(coerce_bool(data.get("has_unread"))) if "has_unread" in data else None
        )
    except EeroException as e:
        _LOGGER.debug("Unread-notifications flag unavailable for %s: %s", network_id, e)

    return NotificationsResponse(settings=settings_data, has_unread=has_unread)


class NotificationHistoryResponse(BaseModel):
    """Notification history entries."""

    history: list[dict[str, Any]] = []


@router.get(
    "/{network_id}/notifications/history", response_model=NotificationHistoryResponse
)
async def get_network_notification_history(
    network_id: str,
    timestamp: str | None = Query(None, description="ISO-8601 pagination cursor"),
    client: EeroClient = Depends(require_auth),
) -> NotificationHistoryResponse:
    """Get notification history. Verified read."""
    if timestamp is not None and not is_valid_iso8601(timestamp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="timestamp must be an ISO-8601 timestamp.",
        )
    raw = await client.get_notification_history(
        network_id=network_id, timestamp=timestamp
    )
    return NotificationHistoryResponse(history=extract_list(raw, "history"))
