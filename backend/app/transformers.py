"""Transformers for converting raw eero-api responses to usable data.

As of eero-api v2.0.0, all responses are raw JSON in the format:
    {"meta": {...}, "data": {...}}

This module provides extraction and normalization functions.
"""

from typing import Any


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

    return {
        "id": net_id,
        "url": raw.get("url"),
        "name": raw.get("name"),
        "status": status,
        "isp_name": isp_name,
        "public_ip": public_ip,
        "guest_network_enabled": raw.get("guest_network_enabled", False),
        "guest_network_name": raw.get("guest_network_name"),
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
            frequency = "5GHz" if frequency_mhz > 4000 else "2.4GHz"
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
        "status": raw.get("status"),
        "state": raw.get("state"),
        "location": location,
        "is_gateway": raw.get("gateway", False) or raw.get("is_gateway", False),
        "is_primary": raw.get("is_primary", False) or raw.get("is_primary_node", False),
        "wired": raw.get("wired", False),
        "connection_type": raw.get("connection_type"),
        "mesh_quality_bars": raw.get("mesh_quality_bars"),
        "ip_address": raw.get("ip_address"),
        "using_wan": raw.get("using_wan"),
        "connected_clients_count": raw.get("connected_clients_count", 0),
        "connected_wired_clients_count": raw.get("connected_wired_clients_count"),
        "connected_wireless_clients_count": raw.get("connected_wireless_clients_count"),
        "firmware_version": raw.get("firmware_version")
        or raw.get("os_version")
        or raw.get("os"),
        "os_version": raw.get("os_version") or raw.get("os"),
        "led_on": raw.get("led_on"),
        "led_brightness": raw.get("led_brightness"),
        "uptime": raw.get("uptime"),
        "cpu_usage": raw.get("cpu_usage"),
        "memory_usage": raw.get("memory_usage"),
        "temperature": raw.get("temperature"),
        "heartbeat_ok": raw.get("heartbeat_ok"),
        "update_available": raw.get("update_available"),
        "provides_wifi": raw.get("provides_wifi"),
        "auto_provisioned": raw.get("auto_provisioned"),
        "retrograde_capable": raw.get("retrograde_capable"),
        "last_heartbeat": raw.get("last_heartbeat"),
        "last_reboot": raw.get("last_reboot"),
        "joined": raw.get("joined"),
        "bands": raw.get("bands"),
        "wifi_bssids": raw.get("wifi_bssids"),
        "bssids_with_bands": raw.get("bssids_with_bands"),
        "ethernet_addresses": raw.get("ethernet_addresses"),
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
