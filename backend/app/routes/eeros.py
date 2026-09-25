"""Eero node routes for the Eero Dashboard."""

import logging
from datetime import UTC, datetime
from typing import Any

from eero import EeroClient
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError

from .._coercion import coerce_bool, coerce_int, coerce_numeric
from ..deps import (
    get_network_id,
    require_auth,
    require_experimental_writes,
    validate_request_path_ids,
)
from ..transformers import (
    check_success,
    extract_data,
    extract_id_from_url,
    extract_list,
    is_unsafe_short_text,
    normalize_eero,
    strip_sensitive_keys,
)
from .auth import limiter

router = APIRouter(dependencies=[Depends(validate_request_path_ids)])
_LOGGER = logging.getLogger(__name__)


def _safe_str(value: Any) -> str:
    """Coerce a value to a non-None string for required string fields.

    Required ``str`` fields on the response models must never receive None
    or a non-string value, otherwise model validation fails and the request
    returns HTTP 500. This guarantees a plain string regardless of the raw
    API value's shape.

    Args:
        value: Raw value from the (normalized) API response.

    Returns:
        The value as a string, or an empty string when it is None.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


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
            reboot_time = reboot_time.replace(tzinfo=UTC)

        now = datetime.now(UTC)
        delta = now - reboot_time
        return int(delta.total_seconds())
    except Exception as e:
        _LOGGER.debug("Failed to calculate uptime from %s: %s", last_reboot, e)
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

    model_config = ConfigDict(extra="ignore")


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

    model_config = ConfigDict(extra="ignore")


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
    raw_response = await client.get_eeros(network_id, refresh_cache=refresh)
    raw_eeros = extract_list(raw_response, "eeros")

    result = []
    for raw_eero in raw_eeros:
        eero = normalize_eero(raw_eero)
        try:
            result.append(
                EeroSummary(
                    id=_safe_str(eero.get("id") or eero.get("serial")),
                    url=_safe_str(eero.get("url")),
                    serial=_safe_str(eero.get("serial")),
                    mac_address=_safe_str(eero.get("mac_address")),
                    model=_safe_str(eero.get("model")),
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
        except ValidationError as e:
            # An unexpected response shape for one eero must not blank
            # the entire list — degrade that entry to a minimal summary.
            _LOGGER.error("Eero summary failed validation, degrading entry: %s", e)
            result.append(
                EeroSummary(
                    id=_safe_str(eero.get("id") or eero.get("serial")),
                    url=_safe_str(eero.get("url")),
                    serial=_safe_str(eero.get("serial")),
                    mac_address=_safe_str(eero.get("mac_address")),
                    model=_safe_str(eero.get("model")),
                    status="unknown",
                )
            )

    return result


@router.get("/{eero_id}", response_model=EeroDetail)
async def get_eero(
    eero_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
    refresh: bool = Query(False, description="Force cache refresh"),
) -> EeroDetail:
    """Get detailed information about a specific Eero node."""
    raw_response = await client.get_eero(eero_id, network_id, refresh_cache=refresh)
    eero = normalize_eero(extract_data(raw_response))

    # Extract network info
    network = eero.get("network", {}) or {}
    network_name = network.get("name") if isinstance(network, dict) else None
    network_url = network.get("url") if isinstance(network, dict) else None

    # Extract organization info
    org = eero.get("organization", {}) or {}
    organization_name = org.get("name") if isinstance(org, dict) else None
    organization_id = (
        coerce_int(org.get("id"), field_name="organization_id")
        if isinstance(org, dict)
        else None
    )

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

    # Format bssids_with_bands — keep only dict entries so the field
    # always matches the declared list[dict] type.
    bssids_with_bands = eero.get("bssids_with_bands")
    if isinstance(bssids_with_bands, list):
        bssids_with_bands = [
            {
                "band": b.get("band"),
                "ethernet_address": b.get("ethernet_address"),
            }
            for b in bssids_with_bands
            if isinstance(b, dict)
        ] or None
    else:
        bssids_with_bands = None

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

    # Coerce numeric performance fields — the Eero Cloud API may return
    # these as dicts (e.g. {"seconds": N}) instead of plain numbers.
    # coerce_numeric() always yields float | None so callers are safe.
    _raw_uptime = coerce_numeric(eero.get("uptime"), field_name="uptime")
    uptime_seconds: int | None = (
        int(_raw_uptime)
        if _raw_uptime is not None
        else calculate_uptime_seconds(eero.get("last_reboot"))
    )

    eero_id_value = _safe_str(eero.get("id") or eero.get("serial") or eero_id)

    # This inner try/except is a real fallback (phase-6.0-revamp.md § 3.4):
    # an unexpected response shape must degrade to a minimal record, not 500.
    try:
        return EeroDetail(
            id=eero_id_value,
            url=_safe_str(eero.get("url")),
            serial=_safe_str(eero.get("serial")),
            mac_address=_safe_str(eero.get("mac_address")),
            model=_safe_str(eero.get("model")),
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
            uptime=uptime_seconds,
            cpu_usage=coerce_numeric(eero.get("cpu_usage"), field_name="cpu_usage"),
            memory_usage=coerce_numeric(
                eero.get("memory_usage"), field_name="memory_usage"
            ),
            temperature=coerce_numeric(
                eero.get("temperature"), field_name="temperature"
            ),
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
    except ValidationError as e:
        # The Eero Cloud API returned a shape that does not match the
        # EeroDetail model. Degrade gracefully to a minimal record
        # instead of returning HTTP 500, so the detail page still loads.
        _LOGGER.error(
            "Eero %s response failed validation, returning degraded detail: %s",
            eero_id,
            e,
        )
        return EeroDetail(
            id=eero_id_value,
            url=_safe_str(eero.get("url")),
            serial=_safe_str(eero.get("serial")),
            mac_address=_safe_str(eero.get("mac_address")),
            model=_safe_str(eero.get("model")),
            status="unknown",
        )


@router.post("/{eero_id}/reboot", response_model=EeroAction)
async def reboot_eero(
    eero_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroAction:
    """Reboot an Eero node."""
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


@router.post("/{eero_id}/led", response_model=EeroAction)
async def set_eero_led(
    eero_id: str,
    enabled: bool = Query(..., description="Turn LED on or off"),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroAction:
    """Turn the LED on or off for an Eero node."""
    raw_result = await client.set_led(eero_id, enabled=enabled, network_id=network_id)
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


_LOCATION_MAX_BYTES = 32


class LocationUpdateRequest(BaseModel):
    """Request body for PUT /{eero_id}/location."""

    location: str

    model_config = ConfigDict(extra="ignore")


class LocationUpdateResponse(BaseModel):
    """Response for a location write, with a read-back."""

    success: bool
    changed: bool
    location: str | None = None


@router.put(
    "/{eero_id}/location",
    response_model=LocationUpdateResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("10/minute", scope="experimental_writes")
async def set_eero_location_route(
    request: Request,
    eero_id: str,
    body: LocationUpdateRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> LocationUpdateResponse:
    """Set the descriptive location label for an eero.

    Unverified write (phase-6.0-revamp.md § 5, WP7 follow-up (c);
    sdk-surface-map-v8.0.3.md WP7: ``set_location``'s own SDK docstring
    says "has not been confirmed against a live network" and prescribes a
    read-compare-skip discipline). Follows that discipline exactly: read
    the eero first, skip the write entirely when the stripped requested
    value already matches the stored one, and read back afterwards so the
    response reflects what the API actually stored. Never retried on
    failure.
    """
    new_location = body.location.strip()
    if not new_location or is_unsafe_short_text(
        new_location, max_bytes=_LOCATION_MAX_BYTES
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"location must be 1-{_LOCATION_MAX_BYTES} bytes, no control characters.",
        )

    raw_eero = await client.get_eero(eero_id, network_id=network_id)
    current = normalize_eero(extract_data(raw_eero))
    current_location = (current.get("location") or "").strip()

    if new_location == current_location:
        return LocationUpdateResponse(
            success=True, changed=False, location=current_location
        )

    raw_result = await client.set_location(eero_id, new_location, network_id=network_id)
    success = check_success(raw_result)

    raw_eero = await client.get_eero(eero_id, network_id=network_id, refresh_cache=True)
    updated = normalize_eero(extract_data(raw_eero))
    return LocationUpdateResponse(
        success=success, changed=True, location=updated.get("location")
    )


class LedStatus(BaseModel):
    """Current LED state for an eero node."""

    led_on: bool | None = None
    led_brightness: int | None = None


@router.get("/{eero_id}/led", response_model=LedStatus)
async def get_eero_led(
    eero_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> LedStatus:
    """Get the current LED on/off state and brightness for an eero node."""
    raw = await client.get_led_status(eero_id, network_id=network_id)
    data = extract_data(raw)
    return LedStatus(
        led_on=coerce_bool(data.get("led_on"), field_name="led_on"),
        led_brightness=coerce_int(
            data.get("led_brightness"), field_name="led_brightness"
        ),
    )


class EeroLedBrightnessAction(EeroAction):
    """Response for the LED brightness write, with a read-back."""

    led_brightness: int | None = None


@router.put("/{eero_id}/led/brightness", response_model=EeroLedBrightnessAction)
@limiter.shared_limit("10/minute", scope="led_brightness")
async def set_eero_led_brightness(
    request: Request,
    eero_id: str,
    brightness: int = Query(..., ge=0, le=100, description="LED brightness (0-100)"),
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroLedBrightnessAction:
    """Set the LED brightness for an Eero node, then read it back.

    Verified write (sdk-surface-map-v8.0.3.md WP6 allowlist); ``brightness``
    is validated to 0-100 by the query parameter's own bounds before any
    SDK call. Rate limited to 10/minute (security review, 2026-09-24).
    """
    raw_result = await client.set_led_brightness(
        eero_id, brightness=brightness, network_id=network_id
    )
    success = check_success(raw_result)
    raw_status = await client.get_led_status(eero_id, network_id=network_id)
    read_back = coerce_int(
        extract_data(raw_status).get("led_brightness"), field_name="led_brightness"
    )
    return EeroLedBrightnessAction(
        success=success,
        eero_id=eero_id,
        action="led_brightness",
        message=(
            f"LED brightness set to {brightness}%."
            if success
            else "Failed to set LED brightness."
        ),
        led_brightness=read_back,
    )


class EeroConnection(BaseModel):
    """One client connection reported by an eero's own ``connections`` link.

    Security review, 2026-09-24 (L3): the upstream response shape is
    unfixtured - no eero-api test fixture covers ``get_connections``'s
    response body (SDK docstring: "Raw API response"). Fields below are
    the allowlisted subset this backend expects, taken from the same
    concepts ``normalize_device``/``normalize_eero`` already expose for a
    connected client (id/url, mac, ip, nickname/hostname/display_name,
    connection type, band, signal, last-seen), since a connection entry
    describes a client attached to this eero. ``extra="ignore"`` drops
    anything unexpected, and ``strip_sensitive_keys`` is applied to the
    raw entry as a second layer before these fields are read off it.
    """

    id: str | None = None
    url: str | None = None
    mac: str | None = None
    ip: str | None = None
    nickname: str | None = None
    hostname: str | None = None
    display_name: str | None = None
    connection_type: str | None = None
    band: str | None = None
    signal: Any = None
    last_active: str | None = None

    model_config = ConfigDict(extra="ignore")


def _normalize_eero_connection(raw: dict[str, Any]) -> EeroConnection:
    connectivity = raw.get("connectivity")
    connectivity = connectivity if isinstance(connectivity, dict) else {}

    band = None
    frequency_mhz = connectivity.get("frequency")
    if isinstance(frequency_mhz, (int, float)):
        # Same thresholds as normalize_device (IEEE/FCC band boundaries).
        if frequency_mhz >= 5925:
            band = "6GHz"
        elif frequency_mhz > 4000:
            band = "5GHz"
        else:
            band = "2.4GHz"

    signal = connectivity.get("signal") if connectivity else raw.get("signal")

    connection_type = raw.get("connection_type")
    if connection_type is None and "wireless" in raw:
        connection_type = "wireless" if raw.get("wireless") else "wired"

    return EeroConnection(
        id=extract_id_from_url(raw.get("url")),
        url=raw.get("url"),
        mac=raw.get("mac"),
        ip=raw.get("ip"),
        nickname=raw.get("nickname"),
        hostname=raw.get("hostname"),
        display_name=raw.get("display_name")
        or raw.get("nickname")
        or raw.get("hostname"),
        connection_type=connection_type,
        band=band,
        signal=signal,
        last_active=raw.get("last_active"),
    )


class EeroConnectionsResponse(BaseModel):
    """An eero's client connections."""

    connections: list[EeroConnection] = []


@router.get("/{eero_id}/connections", response_model=EeroConnectionsResponse)
async def get_eero_connections(
    eero_id: str,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> EeroConnectionsResponse:
    """Get an eero's client connections. Verified read."""
    raw = await client.get_connections(eero_id, network_id=network_id)
    connections = extract_list(raw, "connections")
    return EeroConnectionsResponse(
        connections=[
            _normalize_eero_connection(strip_sensitive_keys(c))
            for c in connections
            if isinstance(c, dict)
        ]
    )


# ---------------------------------------------------------------------------
# Node / port actions (phase-6.0-revamp.md WP7, family 6). Unverified,
# non-settings writes (§ 5): gated behind require_experimental_writes.
# Mirrors the SDK's own ``_NODE_ACTIONS``/``_PORT_ACTIONS`` frozensets
# (eero.api.eeros) so an invalid action 422s before any network round trip;
# ``test_node_port_actions.py`` asserts these mirror the SDK's own sets.
# ---------------------------------------------------------------------------

NODE_ACTIONS = frozenset({"POWER_CYCLE_ALL_PORTS", "POWER_CYCLE_ALL_PORTS_AND_REBOOT"})

PORT_ACTIONS = frozenset(
    {
        "ENABLE_DATA",
        "DISABLE_DATA",
        "ENABLE_POE",
        "DISABLE_POE",
        "ENABLE_PORT",
        "DISABLE_PORT",
        "RESTART_POWER",
        "ENABLE_PORT_SECURITY",
        "DISABLE_PORT_SECURITY",
    }
)

# node_action's reboot variant (§ 5, § 7 WP7 spec): the response must carry
# reboots_node: true so the frontend can show reboot-class UX for this one
# action without hardcoding it a second time.
_NODE_ACTION_REBOOTS = {"POWER_CYCLE_ALL_PORTS_AND_REBOOT"}

# Disruptive PORT_ACTIONS this route refuses on a gateway's uplink port
# (SECURITY-SME finding, 2026-09-24): disabling data/PoE/the port itself on
# the gateway's WAN-facing port would sever the whole network's internet
# connectivity through an "unverified write" endpoint with no confirmation
# step of its own.
_DISRUPTIVE_PORT_ACTIONS = frozenset({"DISABLE_DATA", "DISABLE_POE", "DISABLE_PORT"})


async def _gateway_uplink_port_response(
    client: EeroClient, eero_id: str, port_number: str, network_id: str
) -> JSONResponse | None:
    """Build a refusal response for a disruptive action on a gateway's
    WAN/uplink port, or ``None`` if the action may proceed.

    Reads the target eero's own record (never cached - a stale "is this
    the uplink" read would defeat the guard) and inspects
    ``ethernet_ports`` (``normalize_eero``'s ``is_wan_port`` field). If the
    eero is the gateway and either the named port is flagged as the WAN
    port, or the port list does not identify a WAN port at all (so the
    uplink cannot be ruled out), the action is refused outright rather than
    guessed at.

    Returns:
        A 422 ``JSONResponse`` with ``type: "port_protected"`` at the top
        level (matching every other typed-error response in this API), or
        ``None`` when the action is not against a gateway's uplink.
    """
    raw_eero = await client.get_eero(eero_id, network_id=network_id, refresh_cache=True)
    eero = normalize_eero(extract_data(raw_eero))
    if not eero.get("is_gateway"):
        return None

    ports = eero.get("ethernet_ports") or []
    matched_port = next(
        (p for p in ports if str(p.get("port_name")) == port_number), None
    )
    any_wan_port_identified = any(p.get("is_wan_port") for p in ports)

    is_uplink = (matched_port is not None and matched_port.get("is_wan_port")) or (
        not any_wan_port_identified
    )
    if not is_uplink:
        return None

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "detail": (
                "Refusing to disable data/power/the port on the gateway's "
                + "WAN/uplink port - this would disconnect the whole network."
            ),
            "type": "port_protected",
        },
    )


class NodeActionRequest(BaseModel):
    """Request body for POST /{eero_id}/node-action."""

    action: str

    model_config = ConfigDict(extra="ignore")


class NodeActionResponse(BaseModel):
    """Response for a node-action write."""

    success: bool
    eero_id: str
    action: str
    reboots_node: bool = False


@router.post(
    "/{eero_id}/node-action",
    response_model=NodeActionResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("2/minute", scope="node_actions")
async def node_action_route(
    request: Request,
    eero_id: str,
    body: NodeActionRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> NodeActionResponse:
    """Power-cycle an eero's ports, optionally rebooting the node.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7): both actions
    power-cycle the eero's ports, dropping wired clients while they
    renegotiate; ``POWER_CYCLE_ALL_PORTS_AND_REBOOT`` additionally reboots
    the eero itself. Never retried on failure.
    """
    if body.action not in NODE_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"action must be one of {sorted(NODE_ACTIONS)}.",
        )
    raw_result = await client.node_action(eero_id, body.action, network_id=network_id)
    success = check_success(raw_result)
    return NodeActionResponse(
        success=success,
        eero_id=eero_id,
        action=body.action,
        reboots_node=body.action in _NODE_ACTION_REBOOTS,
    )


class PortActionRequest(BaseModel):
    """Request body for POST /{eero_id}/ports/{port_number}/action."""

    action: str

    model_config = ConfigDict(extra="ignore")


class PortActionResponse(BaseModel):
    """Response for a port-action write."""

    success: bool
    eero_id: str
    port_number: str
    action: str


@router.post(
    "/{eero_id}/ports/{port_number}/action",
    response_model=PortActionResponse,
    dependencies=[Depends(require_experimental_writes)],
)
@limiter.shared_limit("2/minute", scope="node_actions")
async def port_action_route(
    request: Request,
    eero_id: str,
    port_number: str,
    body: PortActionRequest,
    client: EeroClient = Depends(require_auth),
    network_id: str = Depends(get_network_id),
) -> PortActionResponse | JSONResponse:
    """Run a port-level action (enable/disable data, PoE, the port itself,
    port security, or a power restart) on one of an eero's ports.

    Unverified write (phase-6.0-revamp.md § 5, § 7 WP7); several actions
    are inherently disruptive to whatever is connected to that port. Never
    retried on failure. ``DISABLE_DATA``/``DISABLE_POE``/``DISABLE_PORT``
    against a gateway's WAN/uplink port are refused outright (SECURITY-SME
    finding, 2026-09-24) rather than executed - see
    ``_gateway_uplink_port_response``.
    """
    if body.action not in PORT_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"action must be one of {sorted(PORT_ACTIONS)}.",
        )
    if body.action in _DISRUPTIVE_PORT_ACTIONS:
        refusal = await _gateway_uplink_port_response(
            client, eero_id, port_number, network_id
        )
        if refusal is not None:
            return refusal
    raw_result = await client.port_action(
        eero_id, port_number, body.action, network_id=network_id
    )
    success = check_success(raw_result)
    return PortActionResponse(
        success=success,
        eero_id=eero_id,
        port_number=port_number,
        action=body.action,
    )
