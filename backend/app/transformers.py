"""Transformers for converting raw eero-api responses to usable data.

As of eero-api v2.0.0, all responses are raw JSON in the format:
    {"meta": {...}, "data": {...}}

This module provides extraction and normalization functions.
"""

import ipaddress
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

from ._coercion import coerce_bool, coerce_int, coerce_numeric

# Shared identifier/format validators (phase-6.0-revamp.md WP6): kept here
# alongside ``is_unsafe_short_text`` since they are reused across
# ``routes/networks.py``, ``routes/devices.py``, ``routes/profiles.py`` and
# ``routes/eeros.py`` for query/body validation before any SDK call.
_MAC_RE = re.compile(r"[0-9a-f]{2}(:[0-9a-f]{2}){5}")
_DEVICE_TYPE_RE = re.compile(r"[a-z0-9_]{1,40}")

# Identifier guard (security review, 2026-09-24): shared by every route that
# interpolates a caller-supplied id into a URL path or PromQL selector.
# Originally local to routes/metrics.py; moved here so routes/networks.py,
# routes/profiles.py, routes/eeros.py and routes/devices.py share one
# implementation. fullmatch (not match + "$") is deliberate: "$" in a Python
# regex matches just before a trailing "\n" as well as at the true end of
# string, so re.match(..., "$") would accept "abc\n" (delivered as
# "abc%0A"). eero-api 8.0.3's own eero.api.links._validate_identifier has
# the same "$" weakness, so the SDK's own validator is a second, redundant
# layer, not the primary defense.
_IDENTIFIER_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]*")

try:
    from eero.api.links import validate_identifier as _sdk_validate_identifier
except ImportError:  # pragma: no cover - defensive only; present since 8.0.1
    _sdk_validate_identifier = None


class InvalidIdentifierError(ValueError):
    """Raised by ``validate_path_id`` when a caller-supplied id is malformed.

    Routes catch this and re-raise as ``HTTPException(400)`` - kept as a
    plain ``ValueError`` subclass (rather than raising ``HTTPException``
    directly from this module) so ``transformers.py`` stays framework-free.
    """


def validate_path_id(value: str) -> str:
    """Validate a bare identifier before it is placed in a URL path or a
    PromQL label selector.

    Args:
        value: The caller-supplied identifier.

    Returns:
        ``value`` unchanged, once validated.

    Raises:
        InvalidIdentifierError: If ``value`` is empty, contains ``..``, or
            does not match the allowed identifier grammar.
    """
    if not value or ".." in value or not _IDENTIFIER_RE.fullmatch(value):
        raise InvalidIdentifierError(value)
    if _sdk_validate_identifier is not None:
        try:
            _sdk_validate_identifier(value)
        except Exception as exc:  # eero.exceptions.EeroValidationException
            raise InvalidIdentifierError(value) from exc
    return value


# Recursively stripped from every passthrough (undocumented-shape) API
# response before it reaches the client (security review, 2026-09-24;
# widened by SECURITY-SME finding, 2026-09-24). Credential-shaped keys the
# eero cloud API is not contractually forbidden from including in one of
# these payloads. ``key``/``credential`` are broad on their own - e.g. a
# scan result's "channel" or a connection's "network_key" - so
# ``_SENSITIVE_KEY_ALLOWLIST`` exempts specific, verified-safe key names
# rather than narrowing the pattern itself.
_SENSITIVE_KEY_RE = re.compile(
    r"(pass|psk|secret|token|key|credential|invite_(url|code)|^code$|^pin$)",
    re.IGNORECASE,
)

# Key names that would otherwise match ``_SENSITIVE_KEY_RE`` (via "key") but
# are verified-safe structural/label fields in eero-api v8.0.3 responses,
# not credential material. Exact-match only (not substring), so this never
# widens the hole for anything like "network_key" or "api_key".
#
# - "key": the entitlement-feature list element's own identifier field
#   (``get_entitlement_features``' ``data.features`` entries look like
#   ``{"key": "eero_plus"}`` - sdk-surface-map-v8.0.3.md WP6; confirmed by
#   test_entitlements.py::test_returns_all_sources_combined), not a
#   cryptographic key.
_SENSITIVE_KEY_ALLOWLIST: frozenset[str] = frozenset({"key"})


def strip_sensitive_keys(value: Any) -> Any:
    """Recursively remove credential-shaped keys from a raw API payload.

    Applied to every "pass the raw dict/list through unchanged" response in
    this backend - undocumented shapes from eero-api v8.0.3 may carry a
    password, PSK, secret, token, credential, verification code/PIN, or
    join-credential URL that must never reach the frontend. Matching is
    case-insensitive and substring-based (``re.search``), so
    ``guest_password``, ``ssid_psk``, ``network_key`` and ``invite_url``
    are all caught; ``_SENSITIVE_KEY_ALLOWLIST`` exempts specific key names
    known not to carry credential material.

    Args:
        value: A raw dict, list, or scalar from an API response.

    Returns:
        A deep copy of ``value`` with any dict key matching the sensitive
        pattern (and not allowlisted) removed. Non-dict/list values are
        returned unchanged.
    """
    if isinstance(value, dict):
        return {
            k: strip_sensitive_keys(v)
            for k, v in value.items()
            if str(k).lower() in _SENSITIVE_KEY_ALLOWLIST
            or not _SENSITIVE_KEY_RE.search(str(k))
        }
    if isinstance(value, list):
        return [strip_sensitive_keys(item) for item in value]
    return value


def is_valid_mac(value: str) -> bool:
    """Check whether ``value`` is a lowercase colon-separated MAC address."""
    return bool(_MAC_RE.fullmatch(value))


def is_valid_device_type(value: str) -> bool:
    """Conservative allowlist for ``set_device_type``.

    eero-api v8.0.3 ships no device-type catalogue
    (sdk-surface-map-v8.0.3.md WP6: "ABSENT in SDK"), so this accepts any
    lowercase snake_case token up to 40 characters rather than a fixed
    enum built from unverified sources.
    """
    return bool(_DEVICE_TYPE_RE.fullmatch(value))


def is_valid_iso8601(value: str) -> bool:
    """Check whether ``value`` parses as an ISO-8601 datetime (Z accepted)."""
    if not isinstance(value, str) or not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _as_aware_utc(value: datetime) -> datetime:
    """Treat a naive datetime as UTC so naive/aware comparisons never raise.

    ``datetime.fromisoformat`` returns a naive ``datetime`` for an input
    with no offset (e.g. ``"2026-09-24T00:00:00"``, as opposed to one
    ending in ``Z`` or ``+00:00``). Comparing that directly against an
    aware datetime raises ``TypeError`` (security review, 2026-09-24) -
    surfacing as an unhandled 500 on a route that compares two
    caller-supplied timestamps. Assume UTC for a naive value, matching this
    codebase's convention everywhere else (``datetime.now(UTC)``).
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def parse_iso8601(value: str) -> datetime:
    """Parse an ISO-8601 timestamp to an aware ``datetime`` (UTC if naive).

    Callers must validate with ``is_valid_iso8601`` first; this raises
    ``ValueError`` on a malformed value like ``datetime.fromisoformat``.
    """
    return _as_aware_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))


def has_control_or_format_chars(value: str) -> bool:
    """Check whether ``value`` contains a Unicode control or format character.

    Shared by ``routes/networks.py`` (network name) and ``routes/devices.py``
    (device nickname) - security review finding, 2026-09-24. Unicode
    category ``Cc`` (control, e.g. NUL, CR, LF, ESC) and ``Cf`` (format,
    e.g. zero-width joiners, bidi overrides, BOM) cover the characters that
    can corrupt terminal/log output or spoof direction-sensitive UI text
    without being visually obvious in a text box.

    Args:
        value: The candidate text.

    Returns:
        True if any character falls in the ``Cc``/``Cf`` categories.
    """
    return any(unicodedata.category(ch) in ("Cc", "Cf") for ch in value)


def is_unsafe_short_text(value: str, *, max_bytes: int) -> bool:
    """Check a short user-supplied text field for control/formatting chars
    or a byte length over ``max_bytes``.

    Args:
        value: The candidate text, already stripped of leading/trailing
            whitespace by the caller.
        max_bytes: Maximum allowed UTF-8-encoded length.

    Returns:
        True if the value is unsafe (either check fails).
    """
    if has_control_or_format_chars(value):
        return True
    return len(value.encode()) > max_bytes


def _as_str_list(value: Any) -> list[str] | None:
    """Coerce a raw value into a list of strings, or None.

    The Eero Cloud API normally returns ``bands``, ``wifi_bssids`` and
    ``ethernet_addresses`` as flat string lists, but occasionally wraps the
    entries in objects. Non-scalar entries are dropped so downstream model
    validation (which expects ``list[str]``) never sees an unexpected shape.

    Args:
        value: Raw value from the API response.

    Returns:
        A list of strings, or None when there is no usable data.
    """
    if not isinstance(value, list):
        return None
    result = [str(item) for item in value if isinstance(item, (str, int, float))]
    return result or None


def extract_data(raw_response: Any) -> dict[str, Any]:
    """Extract data from raw API response envelope.

    For single-item endpoints (get_network, get_device, etc.), the data
    is a dictionary. For list endpoints, use extract_list() instead.

    Args:
        raw_response: Raw response from eero-api

    Returns:
        Extracted data dictionary
    """
    if raw_response is None:
        return {}
    if not isinstance(raw_response, dict):
        return {}
    # If it has "meta" and "data" keys, it's an envelope - extract data
    if "meta" in raw_response and "data" in raw_response:
        data = raw_response.get("data", {})
        # For single-item endpoints, data is a dict
        if isinstance(data, dict):
            return dict(data)
        # If data is a list, return empty dict (caller should use extract_list)
        return {}
    # Otherwise return as-is (already extracted or different format)
    return dict(raw_response)


def extract_list(
    raw_response: Any, list_key: str | None = None
) -> list[dict[str, Any]]:
    """Extract a list from raw API response.

    The real Eero API returns lists directly in the data field:
    - {"meta": {...}, "data": [...]}

    This function handles:
    - Direct list in response (already extracted)
    - Raw response with meta/data envelope
    - Legacy nested formats for backward compatibility

    Args:
        raw_response: Raw response from eero-api
        list_key: Optional key for the list within data (legacy, rarely needed)

    Returns:
        Extracted list of dictionaries
    """
    if raw_response is None:
        return []

    # If already a list, return it directly
    if isinstance(raw_response, list):
        return list(raw_response)

    # Extract data from envelope if present
    if isinstance(raw_response, dict):
        # Standard format: {"meta": {...}, "data": [...]}
        if "meta" in raw_response and "data" in raw_response:
            data = raw_response.get("data")
            # Most common case: data is directly a list
            if isinstance(data, list):
                return list(data)
            # Handle dict data (some endpoints)
            if isinstance(data, dict):
                # Try specific list_key first
                if list_key and list_key in data:
                    result = data[list_key]
                    if isinstance(result, list):
                        return list(result)
                    # Handle nested {"key": {"data": [...]}} structure
                    if isinstance(result, dict) and "data" in result:
                        nested = result["data"]
                        if isinstance(nested, list):
                            return list(nested)
                # Try common list keys as fallback
                for key in ["data", "networks", "eeros", "devices", "profiles"]:
                    if key in data:
                        result = data[key]
                        if isinstance(result, list):
                            return list(result)
                        if isinstance(result, dict) and "data" in result:
                            nested = result["data"]
                            if isinstance(nested, list):
                                return list(nested)
            return []
        # No envelope, check if it's a dict with list values
        if list_key and list_key in raw_response:
            result = raw_response[list_key]
            if isinstance(result, list):
                return list(result)

    return []


def extract_id_from_url(url: str | None) -> str | None:
    """Extract ID from an API URL.

    Args:
        url: API URL like "/2.2/networks/123" or "/2.2/devices/abc"

    Returns:
        Extracted ID or None
    """
    if not url:
        return None
    parts = str(url).rstrip("/").split("/")
    return parts[-1] if parts else None


def get_nested(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Safely get a nested value from a dictionary.

    Args:
        data: Dictionary to traverse
        *keys: Keys to follow
        default: Default value if not found

    Returns:
        Found value or default
    """
    result = data
    for key in keys:
        if isinstance(result, dict):
            result = result.get(key)
        else:
            return default
    return result if result is not None else default


def normalize_status(status: Any) -> str:
    """Normalize status field which may be nested.

    Converts eero API status values to consistent frontend values:
    - "green" / "connected" -> "online"
    - "red" / "disconnected" -> "offline"
    - "yellow" -> "warning"

    Args:
        status: Status value (string or {"status": "value"})

    Returns:
        Normalized status string
    """
    if status is None:
        return "unknown"

    # Extract from nested dict if needed
    if isinstance(status, dict):
        status = status.get("status", "unknown")

    status_str = str(status).lower()

    # Map eero API status values to consistent frontend values
    status_map = {
        "green": "online",
        "connected": "online",
        "red": "offline",
        "disconnected": "offline",
        "yellow": "warning",
    }

    return status_map.get(status_str, status_str)


def normalize_network(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw network response to a consistent format.

    Args:
        raw: Raw network data

    Returns:
        Normalized network dictionary
    """
    # Extract ID from URL
    net_id = extract_id_from_url(raw.get("url"))

    # Normalize status
    status = normalize_status(raw.get("status"))

    # Extract ISP - may be in geo_ip.isp or isp.name or isp_name
    isp_name = raw.get("isp_name")
    if not isp_name:
        geo_ip = raw.get("geo_ip", {})
        if isinstance(geo_ip, dict):
            isp_name = geo_ip.get("isp")
    if not isp_name:
        isp_data = raw.get("isp", {})
        if isinstance(isp_data, dict):
            isp_name = isp_data.get("name")
        elif isp_data:
            isp_name = str(isp_data)

    # Extract public_ip - may be in public_ip or wan_ip
    public_ip = raw.get("public_ip") or raw.get("wan_ip")

    # Extract guest network status. The Eero Cloud API returns this as a
    # nested object: {"guest_network": {"enabled": bool, "name": str, ...}}.
    # Older/alternate shapes used flat top-level keys, so fall back to those.
    guest_network = raw.get("guest_network")
    if isinstance(guest_network, dict):
        guest_network_enabled = bool(coerce_bool(guest_network.get("enabled")))
        guest_network_name = guest_network.get("name")
    else:
        guest_network_enabled = bool(coerce_bool(raw.get("guest_network_enabled")))
        guest_network_name = raw.get("guest_network_name")

    return {
        "id": net_id,
        "url": raw.get("url"),
        "name": raw.get("name"),
        "status": status,
        "isp_name": isp_name,
        "public_ip": public_ip,
        "guest_network_enabled": guest_network_enabled,
        "guest_network_name": guest_network_name,
        "speed_test": raw.get("speed_test") or raw.get("speed"),
        "health": raw.get("health"),
        "settings": raw.get("settings"),
        "dhcp": raw.get("dhcp"),
        # Features
        "backup_internet_enabled": raw.get("backup_internet_enabled", False),
        "power_saving": raw.get("power_saving", False),
        "sqm": raw.get("sqm", False),
        "upnp": raw.get("upnp", False),
        "thread": raw.get("thread", False),
        "band_steering": raw.get("band_steering", False),
        "wpa3": raw.get("wpa3", False),
        "ipv6_upstream": raw.get("ipv6_upstream", False),
        # Additional
        "owner": raw.get("owner"),
        "display_name": raw.get("display_name"),
        "wan_type": raw.get("wan_type"),
        "gateway_ip": raw.get("gateway_ip"),
        "connection_mode": raw.get("connection_mode"),
        "created_at": raw.get("created_at"),
        "geo_ip": raw.get("geo_ip"),
        "dns": raw.get("dns"),
        "ipv6": raw.get("ipv6"),
        "premium_dns": raw.get("premium_dns"),
        "updates": raw.get("updates"),
        "ddns": raw.get("ddns"),
        "homekit": raw.get("homekit"),
        "ip_settings": raw.get("ip_settings"),
        "premium_details": raw.get("premium_details"),
        "amazon_account_linked": raw.get("amazon_account_linked", False),
        "alexa_skill": raw.get("alexa_skill", False),
        "last_reboot": raw.get("last_reboot"),
        "_raw": raw,
    }


def normalize_device(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw device response to a consistent format.

    Args:
        raw: Raw device data

    Returns:
        Normalized device dictionary
    """
    # Extract ID from URL
    dev_id = extract_id_from_url(raw.get("url"))

    # Extract connectivity info
    connectivity = raw.get("connectivity", {}) or {}
    signal = None
    signal_bars = None
    frequency = None
    frequency_mhz = None
    rx_bitrate = None
    tx_bitrate = None

    if isinstance(connectivity, dict):
        signal_str = connectivity.get("signal")
        if signal_str and isinstance(signal_str, str):
            try:
                signal = int(signal_str.replace(" dBm", ""))
            except (ValueError, AttributeError):
                pass
        signal_bars = connectivity.get("score_bars")
        frequency_mhz = connectivity.get("frequency")
        if frequency_mhz:
            # WiFi bands per IEEE/FCC: 6 GHz starts at 5925 MHz (Wi-Fi 6E/7),
            # 5 GHz from ~5150 MHz, 2.4 GHz below that.
            if frequency_mhz >= 5925:
                frequency = "6GHz"
            elif frequency_mhz > 4000:
                frequency = "5GHz"
            else:
                frequency = "2.4GHz"
        rx_bitrate = connectivity.get("rx_bitrate")
        tx_bitrate = connectivity.get("tx_bitrate")

        # Extract from rate_info if not directly available
        if not tx_bitrate:
            tx_info = connectivity.get("tx_rate_info", {})
            if isinstance(tx_info, dict):
                rate_bps = tx_info.get("rate_bps")
                if rate_bps and isinstance(rate_bps, (int, float)) and rate_bps > 0:
                    rate_mbps = rate_bps / 1_000_000
                    tx_bitrate = f"{rate_mbps:.1f} MBit/s"

        if not rx_bitrate:
            rx_info = connectivity.get("rx_rate_info", {})
            if isinstance(rx_info, dict):
                rate_bps = rx_info.get("rate_bps")
                if rate_bps and isinstance(rate_bps, (int, float)) and rate_bps > 0:
                    rate_mbps = rate_bps / 1_000_000
                    rx_bitrate = f"{rate_mbps:.1f} MBit/s"

    # Extract source eero info
    source = raw.get("source", {}) or {}
    connected_to_eero = None
    connected_to_eero_id = None
    connected_to_eero_model = None
    if isinstance(source, dict):
        connected_to_eero = source.get("location") or source.get("display_name")
        connected_to_eero_model = source.get("model")
        source_url = source.get("url")
        if source_url:
            import re

            match = re.search(r"/eeros/([^/]+)", source_url)
            if match:
                connected_to_eero_id = match.group(1)

    # Extract profile info
    profile = raw.get("profile", {}) or {}
    profile_id = raw.get("profile_id")
    profile_name = None
    if isinstance(profile, dict):
        profile_name = profile.get("name")
        if not profile_id:
            profile_id = extract_id_from_url(profile.get("url"))

    return {
        "id": dev_id,
        "url": raw.get("url"),
        "mac": raw.get("mac"),
        "ip": raw.get("ip"),
        "ips": raw.get("ips", []),
        "ipv4": raw.get("ipv4"),
        "nickname": raw.get("nickname"),
        "hostname": raw.get("hostname"),
        "display_name": raw.get("display_name")
        or raw.get("nickname")
        or raw.get("hostname"),
        "manufacturer": raw.get("manufacturer"),
        "model_name": raw.get("model_name"),
        "device_type": raw.get("device_type"),
        "connected": raw.get("connected") or False,
        "wireless": raw.get("wireless") or False,
        "blocked": raw.get("blacklisted") or False,
        "paused": raw.get("paused") or False,
        "is_guest": raw.get("is_guest") or False,
        "is_private": raw.get("is_private") or False,
        "connection_type": "wireless" if raw.get("wireless") else "wired",
        "signal_strength": signal,
        "signal_bars": signal_bars,
        "frequency": frequency,
        "frequency_mhz": frequency_mhz,
        "channel": raw.get("channel"),
        "ssid": raw.get("ssid"),
        "rx_bitrate": rx_bitrate,
        "tx_bitrate": tx_bitrate,
        "connected_to_eero": connected_to_eero,
        "connected_to_eero_id": connected_to_eero_id,
        "connected_to_eero_model": connected_to_eero_model,
        "profile_id": profile_id,
        "profile_name": profile_name,
        "last_active": raw.get("last_active"),
        "first_active": raw.get("first_active"),
        "network_id": raw.get("network_id"),
        "subnet_kind": raw.get("subnet_kind"),
        "auth": raw.get("auth"),
        "_raw": raw,
    }


def normalize_eero(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw eero response to a consistent format.

    Args:
        raw: Raw eero data

    Returns:
        Normalized eero dictionary
    """
    # Extract ID from URL
    eero_id = extract_id_from_url(raw.get("url"))

    # Handle location as string or nested object
    location = raw.get("location")
    if isinstance(location, dict):
        location = location.get("address") or location.get("name")

    # Handle status as string or nested object ({"status": "green"}). The
    # Eero Cloud API has been observed to return both shapes for eeros.
    status = raw.get("status")
    if isinstance(status, dict):
        status = status.get("status")

    # Extract ethernet port info
    ethernet_ports = None
    ethernet_status = raw.get("ethernet_status", {})
    if isinstance(ethernet_status, dict):
        statuses = ethernet_status.get("statuses", [])
        if statuses and isinstance(statuses, list):
            ethernet_ports = []
            for port in statuses:
                if isinstance(port, dict):
                    port_info = {
                        "port_name": port.get("port_name"),
                        "interface_number": port.get("interfaceNumber"),
                        "has_carrier": port.get("hasCarrier"),
                        "speed": port.get("speed"),
                        "is_wan_port": port.get("isWanPort"),
                        "is_lte": port.get("isLte"),
                    }
                    neighbor = port.get("neighbor", {})
                    if isinstance(neighbor, dict):
                        metadata = neighbor.get("metadata", {})
                        if isinstance(metadata, dict):
                            port_info["neighbor_location"] = metadata.get("location")
                            port_info["neighbor_port"] = metadata.get("port_name")
                    ethernet_ports.append(port_info)

    return {
        "id": eero_id,
        "url": raw.get("url"),
        "serial": raw.get("serial"),
        "mac_address": raw.get("mac_address"),
        "model": raw.get("model"),
        "model_number": raw.get("model_number"),
        "status": status,
        "state": raw.get("state"),
        "location": location,
        "is_gateway": bool(
            coerce_bool(raw.get("gateway")) or coerce_bool(raw.get("is_gateway"))
        ),
        "is_primary": bool(
            coerce_bool(raw.get("is_primary"))
            or coerce_bool(raw.get("is_primary_node"))
        ),
        "wired": bool(coerce_bool(raw.get("wired"))),
        "connection_type": raw.get("connection_type"),
        "mesh_quality_bars": coerce_int(
            raw.get("mesh_quality_bars"), field_name="mesh_quality_bars"
        ),
        "ip_address": raw.get("ip_address"),
        "using_wan": coerce_bool(raw.get("using_wan"), field_name="using_wan"),
        "connected_clients_count": coerce_int(
            raw.get("connected_clients_count"), field_name="connected_clients_count"
        )
        or 0,
        "connected_wired_clients_count": coerce_int(
            raw.get("connected_wired_clients_count"),
            field_name="connected_wired_clients_count",
        ),
        "connected_wireless_clients_count": coerce_int(
            raw.get("connected_wireless_clients_count"),
            field_name="connected_wireless_clients_count",
        ),
        "firmware_version": raw.get("firmware_version")
        or raw.get("os_version")
        or raw.get("os"),
        "os_version": raw.get("os_version") or raw.get("os"),
        "led_on": coerce_bool(raw.get("led_on"), field_name="led_on"),
        "led_brightness": coerce_int(
            raw.get("led_brightness"), field_name="led_brightness"
        ),
        "uptime": coerce_numeric(raw.get("uptime"), field_name="uptime"),
        "cpu_usage": coerce_numeric(raw.get("cpu_usage"), field_name="cpu_usage"),
        "memory_usage": coerce_numeric(
            raw.get("memory_usage"), field_name="memory_usage"
        ),
        "temperature": coerce_numeric(raw.get("temperature"), field_name="temperature"),
        "heartbeat_ok": coerce_bool(raw.get("heartbeat_ok"), field_name="heartbeat_ok"),
        "update_available": coerce_bool(
            raw.get("update_available"), field_name="update_available"
        ),
        "provides_wifi": coerce_bool(
            raw.get("provides_wifi"), field_name="provides_wifi"
        ),
        "auto_provisioned": coerce_bool(
            raw.get("auto_provisioned"), field_name="auto_provisioned"
        ),
        "retrograde_capable": coerce_bool(
            raw.get("retrograde_capable"), field_name="retrograde_capable"
        ),
        "last_heartbeat": raw.get("last_heartbeat"),
        "last_reboot": raw.get("last_reboot"),
        "joined": raw.get("joined"),
        "bands": _as_str_list(raw.get("bands")),
        "wifi_bssids": _as_str_list(raw.get("wifi_bssids")),
        "bssids_with_bands": raw.get("bssids_with_bands"),
        "ethernet_addresses": _as_str_list(raw.get("ethernet_addresses")),
        "ethernet_ports": ethernet_ports,
        "ipv6_addresses": raw.get("ipv6_addresses"),
        "organization": raw.get("organization"),
        "power_info": raw.get("power_info"),
        "power_saving": raw.get("power_saving"),
        "network": raw.get("network"),
        "_raw": raw,
    }


def normalize_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw profile response to a consistent format.

    Args:
        raw: Raw profile data

    Returns:
        Normalized profile dictionary
    """
    import re

    # Extract ID from URL
    profile_id = extract_id_from_url(raw.get("url"))

    # Extract devices
    devices_raw = raw.get("devices", [])
    if isinstance(devices_raw, dict):
        devices_raw = devices_raw.get("data", [])

    devices = []
    device_ids = []
    for dev in devices_raw if isinstance(devices_raw, list) else []:
        if isinstance(dev, dict):
            device_url = dev.get("url", "")
            device_id = None
            if device_url:
                match = re.search(r"/devices/([^/]+)", device_url)
                if match:
                    device_id = match.group(1)
            if device_id:
                device_ids.append(device_id)
            devices.append(
                {
                    "id": device_id,
                    "url": device_url,
                    "mac": dev.get("mac"),
                    "nickname": dev.get("nickname"),
                    "hostname": dev.get("hostname"),
                    "display_name": (
                        dev.get("display_name")
                        or dev.get("nickname")
                        or dev.get("hostname")
                    ),
                    "manufacturer": dev.get("manufacturer"),
                    "connected": dev.get("connected", False),
                    "wireless": dev.get("wireless", False),
                    "paused": dev.get("paused", False),
                }
            )

    return {
        "id": profile_id,
        "url": raw.get("url"),
        "name": raw.get("name"),
        "paused": raw.get("paused", False),
        "device_count": len(devices),
        "device_ids": device_ids,
        "devices": devices,
        "_raw": raw,
    }


def normalize_speed_test(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a single raw speed-test result to a consistent shape.

    Shared by ``routes/networks.py`` and ``services/collector.py`` so both
    consumers of ``get_speed_tests`` agree on where ``down``/``up``/``date``
    live (phase-6.0-revamp.md § 3.3, § 8.1).

    Args:
        raw: One entry from ``get_speed_tests``' result list.

    Returns:
        A dict with ``down_mbps``, ``up_mbps``, ``latency_ms`` and ``date``.
    """
    down = raw.get("down") if isinstance(raw, dict) else None
    up = raw.get("up") if isinstance(raw, dict) else None
    return {
        "down_mbps": down.get("value") if isinstance(down, dict) else None,
        "up_mbps": up.get("value") if isinstance(up, dict) else None,
        "latency_ms": raw.get("latency") if isinstance(raw, dict) else None,
        "date": raw.get("date") if isinstance(raw, dict) else None,
    }


def normalize_dhcp(dhcp: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize DHCP data to frontend-expected format.

    The API returns:
        {"mode": "custom", "custom": {"start_ip": "...", "end_ip": "...", "subnet_mask": "..."}}

    Frontend expects:
        {"starting_address": "...", "ending_address": "...", "subnet_mask": "...", "lease_time_seconds": ...}

    Args:
        dhcp: Raw DHCP data from API

    Returns:
        Normalized DHCP dictionary or None
    """
    if not dhcp or not isinstance(dhcp, dict):
        return None

    # Try to extract from 'custom' or 'custom_v2' nested objects
    custom = dhcp.get("custom") or dhcp.get("custom_v2") or {}

    if not isinstance(custom, dict):
        custom = {}

    # Build normalized DHCP response
    result = {
        "mode": dhcp.get("mode"),
        "starting_address": custom.get("start_ip") or dhcp.get("starting_address"),
        "ending_address": custom.get("end_ip") or dhcp.get("ending_address"),
        "subnet_mask": custom.get("subnet_mask") or dhcp.get("subnet_mask"),
        "subnet_ip": custom.get("subnet_ip") or dhcp.get("subnet_ip"),
        # Lease time: default to 24 hours (86400 seconds) if not provided
        "lease_time_seconds": dhcp.get("lease_time_seconds")
        or custom.get("lease_time_seconds")
        or 86400,
    }

    # Only return if we have at least some data
    if result["starting_address"] or result["ending_address"] or result["subnet_mask"]:
        return result

    return None


def _normalize_ip_list(value: Any, family: int | None = None) -> list[str]:
    """Coerce a raw value into a list of normalised (compressed) IP strings.

    Un-parseable entries are skipped rather than raised, since this is used
    exclusively on read paths where tolerance matters more than strictness.

    Args:
        value: Raw value from the API response (expected to be a list).
        family: If given (4 or 6), entries of the other family are skipped.

    Returns:
        A list of normalised IP address strings.
    """
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for entry in value:
        if not isinstance(entry, str):
            continue
        try:
            address = ipaddress.ip_address(entry.strip())
        except ValueError:
            continue
        if family is not None and address.version != family:
            continue
        result.append(str(address))
    return result


def normalize_dns(raw_network: dict[str, Any]) -> dict[str, Any]:
    """Normalize DNS settings from a raw network response.

    The Eero API stores IPv4 and IPv6 DNS configuration as two independent,
    asymmetrically-shaped objects on the network resource:

        data.dns.mode                  "custom" | "automatic"
        data.dns.custom.ips            [...]
        data.dns.parent.ips            [...]              (ISP upstream, read-only)
        data.dns.caching               bool
        data.dns.default_test_servers  [{name, ipv4, ipv6}, ...]
        data.ipv6.name_servers.mode    "custom" | "automatic"
        data.ipv6.name_servers.custom  [...]

    IPv6 addresses are stored fully expanded by the API (e.g.
    ``2606:4700:4700:0:0:0:0:1111``); this function normalises every address
    through ``ipaddress`` so servers are always emitted in compressed form.

    Args:
        raw_network: Raw network data (not yet extracted/normalized).

    Returns:
        Normalized DNS dictionary matching the shared frontend/backend contract.
    """
    dns = raw_network.get("dns")
    if not isinstance(dns, dict):
        dns = {}

    ipv6_container = raw_network.get("ipv6")
    if not isinstance(ipv6_container, dict):
        ipv6_container = {}
    name_servers = ipv6_container.get("name_servers")
    if not isinstance(name_servers, dict):
        name_servers = {}

    ipv4_custom = dns.get("custom")
    if not isinstance(ipv4_custom, dict):
        ipv4_custom = {}
    ipv4_servers = _normalize_ip_list(ipv4_custom.get("ips"), family=4)

    ipv6_servers = _normalize_ip_list(name_servers.get("custom"), family=6)

    parent = dns.get("parent")
    if not isinstance(parent, dict):
        parent = {}
    parent_ips = _normalize_ip_list(parent.get("ips"))

    providers: list[dict[str, Any]] = []
    for entry in dns.get("default_test_servers") or []:
        if not isinstance(entry, dict):
            continue
        providers.append(
            {
                "name": entry.get("name"),
                "ipv4": _normalize_ip_list(entry.get("ipv4"), family=4),
                "ipv6": _normalize_ip_list(entry.get("ipv6"), family=6),
            }
        )

    ipv4_mode = dns.get("mode") or "automatic"
    ipv6_mode = name_servers.get("mode") or "automatic"

    return {
        "ipv4": {"mode": ipv4_mode, "servers": ipv4_servers},
        "ipv6": {"mode": ipv6_mode, "servers": ipv6_servers},
        "caching": bool(coerce_bool(dns.get("caching"))),
        "parent_ips": parent_ips,
        "providers": providers,
    }


def check_success(raw_response: Any) -> bool:
    """Check if a raw API response indicates success.

    Args:
        raw_response: Raw response from eero-api

    Returns:
        True if successful, False otherwise
    """
    if raw_response is None:
        return False
    if isinstance(raw_response, bool):
        return raw_response
    if isinstance(raw_response, dict):
        meta = raw_response.get("meta", {})
        if isinstance(meta, dict):
            code = meta.get("code")
            return code == 200 if code is not None else True
        return True
    return bool(raw_response)
