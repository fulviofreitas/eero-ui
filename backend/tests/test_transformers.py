"""Tests for the transformers module.

These tests verify that data extraction and normalization works correctly
with the raw API response format from eero-api v2.0+.
"""

import pytest

from app.transformers import (
    check_success,
    extract_data,
    extract_id_from_url,
    extract_list,
    normalize_device,
    normalize_dns,
    normalize_eero,
    normalize_network,
    normalize_profile,
    normalize_speed_test,
    normalize_status,
)


class TestExtractData:
    """Tests for extract_data function."""

    def test_extracts_from_envelope(self):
        """Should extract data from standard envelope format."""
        response = {"meta": {"code": 200}, "data": {"name": "Test Network"}}
        result = extract_data(response)
        assert result == {"name": "Test Network"}

    def test_returns_empty_for_list_data(self):
        """Should return empty dict when data is a list."""
        response = {"meta": {"code": 200}, "data": [{"id": "1"}, {"id": "2"}]}
        result = extract_data(response)
        assert result == {}

    def test_returns_empty_for_none(self):
        """Should return empty dict for None input."""
        assert extract_data(None) == {}

    def test_returns_empty_for_non_dict(self):
        """Should return empty dict for non-dict input."""
        assert extract_data("string") == {}
        assert extract_data(123) == {}

    def test_returns_as_is_without_envelope(self):
        """Should return dict as-is if no meta/data envelope."""
        data = {"name": "Test", "status": "online"}
        assert extract_data(data) == data


class TestExtractList:
    """Tests for extract_list function."""

    def test_extracts_list_from_data(self):
        """Should extract list directly from data field."""
        response = {
            "meta": {"code": 200},
            "data": [
                {"url": "/devices/1", "name": "Device 1"},
                {"url": "/devices/2", "name": "Device 2"},
            ],
        }
        result = extract_list(response)
        assert len(result) == 2
        assert result[0]["name"] == "Device 1"

    def test_returns_empty_for_none(self):
        """Should return empty list for None input."""
        assert extract_list(None) == []

    def test_returns_list_directly(self):
        """Should return list if already a list."""
        data = [{"id": "1"}, {"id": "2"}]
        assert extract_list(data) == data

    def test_handles_nested_structure_with_key(self):
        """Should handle nested structure when list_key is provided."""
        response = {
            "meta": {"code": 200},
            "data": {"networks": [{"name": "Home"}, {"name": "Office"}]},
        }
        result = extract_list(response, "networks")
        assert len(result) == 2
        assert result[0]["name"] == "Home"

    def test_handles_deeply_nested_structure(self):
        """Should handle deeply nested data structure."""
        response = {
            "meta": {"code": 200},
            "data": {"networks": {"data": [{"name": "Net1"}, {"name": "Net2"}]}},
        }
        result = extract_list(response, "networks")
        assert len(result) == 2

    def test_returns_empty_for_empty_data(self):
        """Should return empty list when data is empty."""
        response = {"meta": {"code": 200}, "data": []}
        assert extract_list(response) == []


class TestExtractIdFromUrl:
    """Tests for extract_id_from_url function."""

    def test_extracts_network_id(self):
        """Should extract network ID from URL."""
        assert extract_id_from_url("/2.2/networks/123456") == "123456"

    def test_extracts_device_id(self):
        """Should extract device ID from URL."""
        assert extract_id_from_url("/2.2/networks/net1/devices/dev123") == "dev123"

    def test_handles_trailing_slash(self):
        """Should handle trailing slash."""
        assert extract_id_from_url("/2.2/eeros/eero123/") == "eero123"

    def test_returns_none_for_empty(self):
        """Should return None for empty input."""
        assert extract_id_from_url(None) is None
        assert extract_id_from_url("") is None


class TestExtractIdFromUrlIdentifierGuard:
    """extract_id_from_url output must be rejected by validate_identifier
    when it is not a single, safe path segment (phase-6.0-revamp.md § 3.2,
    § 2.5). extract_id_from_url() itself does no validation - it is the
    caller's job (deps.get_network_id, routes/metrics.py) to run the result
    through eero.api.links.validate_identifier before using it in a path or
    a PromQL selector. These tests document exactly which extracted values
    that guard must reject.
    """

    def test_rejects_query_string(self):
        """A URL whose last segment carries a query string is rejected."""
        from eero.api.links import validate_identifier
        from eero.exceptions import EeroValidationException

        extracted = extract_id_from_url("/2.2/networks/123?evil=1")
        assert extracted == "123?evil=1"
        with pytest.raises(EeroValidationException):
            validate_identifier(extracted)

    def test_rejects_dot_dot_traversal(self):
        """A URL segment containing '..' is rejected even if regex-shaped."""
        from eero.api.links import validate_identifier
        from eero.exceptions import EeroValidationException

        extracted = extract_id_from_url("/2.2/networks/..-evil")
        assert extracted == "..-evil"
        with pytest.raises(EeroValidationException):
            validate_identifier(extracted)

    def test_rejects_embedded_slash(self):
        """A value containing an unescaped slash is rejected."""
        from eero.api.links import validate_identifier
        from eero.exceptions import EeroValidationException

        with pytest.raises(EeroValidationException):
            validate_identifier("abc/def")

    def test_accepts_a_well_formed_id(self):
        """A normal, single-segment id extracted from a URL is accepted."""
        from eero.api.links import validate_identifier

        extracted = extract_id_from_url("/2.2/networks/net-123_abc.def:1")
        assert validate_identifier(extracted) == extracted


class TestNormalizeStatus:
    """Tests for normalize_status function."""

    def test_normalizes_green_to_online(self):
        """Should normalize 'green' to 'online'."""
        assert normalize_status("green") == "online"
        assert normalize_status("GREEN") == "online"

    def test_normalizes_connected_to_online(self):
        """Should normalize 'connected' to 'online'."""
        assert normalize_status("connected") == "online"
        assert normalize_status("CONNECTED") == "online"

    def test_normalizes_red_to_offline(self):
        """Should normalize 'red' to 'offline'."""
        assert normalize_status("red") == "offline"

    def test_normalizes_disconnected_to_offline(self):
        """Should normalize 'disconnected' to 'offline'."""
        assert normalize_status("disconnected") == "offline"

    def test_normalizes_yellow_to_warning(self):
        """Should normalize 'yellow' to 'warning'."""
        assert normalize_status("yellow") == "warning"

    def test_normalizes_dict_status(self):
        """Should extract and normalize status from dict."""
        assert normalize_status({"status": "green"}) == "online"
        assert normalize_status({"status": "red"}) == "offline"
        assert normalize_status({"status": "connected"}) == "online"

    def test_returns_unknown_for_none(self):
        """Should return 'unknown' for None."""
        assert normalize_status(None) == "unknown"

    def test_passes_through_other_values(self):
        """Should pass through unrecognized values."""
        assert normalize_status("online") == "online"
        assert normalize_status("custom") == "custom"


class TestNormalizeNetwork:
    """Tests for normalize_network function."""

    def test_extracts_id_from_url(self):
        """Should extract network ID from URL."""
        raw = {"url": "/2.2/networks/net123", "name": "Home"}
        result = normalize_network(raw)
        assert result["id"] == "net123"

    def test_extracts_public_ip_from_wan_ip(self):
        """Should map wan_ip to public_ip."""
        raw = {"url": "/networks/1", "wan_ip": "1.2.3.4"}
        result = normalize_network(raw)
        assert result["public_ip"] == "1.2.3.4"

    def test_extracts_isp_from_geo_ip(self):
        """Should extract ISP from geo_ip object."""
        raw = {"url": "/networks/1", "geo_ip": {"isp": "Comcast"}}
        result = normalize_network(raw)
        assert result["isp_name"] == "Comcast"

    def test_normalizes_status(self):
        """Should normalize status field to 'online'."""
        raw = {"url": "/networks/1", "status": {"status": "green"}}
        result = normalize_network(raw)
        assert result["status"] == "online"

    def test_guest_network_enabled_from_nested_object(self):
        """Should read guest network status from the nested guest_network object.

        The Eero Cloud API returns guest network status as a nested object:
        {"guest_network": {"enabled": true, "name": "..."}}.
        """
        raw = {
            "url": "/networks/1",
            "guest_network": {"enabled": True, "name": "Guest WiFi"},
        }
        result = normalize_network(raw)
        assert result["guest_network_enabled"] is True
        assert result["guest_network_name"] == "Guest WiFi"

    def test_guest_network_disabled_from_nested_object(self):
        """Should report guest network disabled when nested enabled is False."""
        raw = {"url": "/networks/1", "guest_network": {"enabled": False}}
        result = normalize_network(raw)
        assert result["guest_network_enabled"] is False

    def test_guest_network_defaults_false_when_absent(self):
        """Should default to False when no guest network data is present."""
        raw = {"url": "/networks/1"}
        result = normalize_network(raw)
        assert result["guest_network_enabled"] is False

    def test_guest_network_legacy_top_level_key(self):
        """Should fall back to the legacy flat guest_network_enabled key."""
        raw = {"url": "/networks/1", "guest_network_enabled": True}
        result = normalize_network(raw)
        assert result["guest_network_enabled"] is True

    def test_speed_test_normalizes_raw_envelope_shape(self):
        """The raw ``speed`` envelope (down/up wrapper dicts) must come out
        in the download_mbps/upload_mbps/timestamp shape the frontend's
        SpeedTestResult expects - not the raw down/up shape (the bug that
        left the dashboard Speed Test card blank)."""
        raw = {
            "url": "/networks/1",
            "speed": {
                "down": {"value": 500.0, "units": "Mbps"},
                "up": {"value": 50.0, "units": "Mbps"},
                "date": "2026-01-01T00:00:00Z",
            },
        }
        result = normalize_network(raw)
        assert result["speed_test"] == {
            "download_mbps": 500.0,
            "upload_mbps": 50.0,
            "latency_ms": None,
            "timestamp": "2026-01-01T00:00:00Z",
        }

    def test_speed_test_prefers_speed_test_key_over_speed(self):
        """``speed_test`` (if present) takes priority over ``speed``."""
        raw = {
            "url": "/networks/1",
            "speed_test": {"down": {"value": 10.0}, "up": {"value": 5.0}},
            "speed": {"down": {"value": 999.0}, "up": {"value": 999.0}},
        }
        result = normalize_network(raw)
        assert result["speed_test"]["download_mbps"] == 10.0
        assert result["speed_test"]["upload_mbps"] == 5.0

    def test_speed_test_passes_through_already_normalized_shape(self):
        """A dict already in the normalized download_mbps/upload_mbps shape
        (e.g. round-tripped through our own API) passes through unchanged."""
        raw = {
            "url": "/networks/1",
            "speed_test": {
                "download_mbps": 123.4,
                "upload_mbps": 45.6,
                "latency_ms": 12.0,
                "timestamp": "2026-01-01T00:00:00+00:00",
            },
        }
        result = normalize_network(raw)
        assert result["speed_test"] == {
            "download_mbps": 123.4,
            "upload_mbps": 45.6,
            "latency_ms": 12.0,
            "timestamp": "2026-01-01T00:00:00+00:00",
        }

    def test_speed_test_none_when_absent(self):
        """No speed/speed_test key at all normalizes to None."""
        raw = {"url": "/networks/1"}
        result = normalize_network(raw)
        assert result["speed_test"] is None

    def test_speed_test_none_when_down_and_up_both_missing(self):
        """A speed object with neither down nor up normalizes to None,
        even though the key itself is present."""
        raw = {"url": "/networks/1", "speed": {"date": "2026-01-01T00:00:00Z"}}
        result = normalize_network(raw)
        assert result["speed_test"] is None


class TestNormalizeDevice:
    """Tests for normalize_device function."""

    def test_extracts_id_from_url(self):
        """Should extract device ID from URL."""
        raw = {"url": "/2.2/devices/dev456", "mac": "AA:BB:CC:DD:EE:FF"}
        result = normalize_device(raw)
        assert result["id"] == "dev456"

    def test_maps_blacklisted_to_blocked(self):
        """Should map blacklisted to blocked."""
        raw = {"url": "/devices/1", "blacklisted": True}
        result = normalize_device(raw)
        assert result["blocked"] is True

    def test_sets_connection_type(self):
        """Should set connection_type based on wireless field."""
        raw_wireless = {"url": "/devices/1", "wireless": True}
        raw_wired = {"url": "/devices/1", "wireless": False}
        assert normalize_device(raw_wireless)["connection_type"] == "wireless"
        assert normalize_device(raw_wired)["connection_type"] == "wired"

    def test_connection_type_falls_back_to_connection_type_field(self):
        """When `wireless` is absent, fall back to a `connection_type` string.

        Matches eero-prometheus-exporter's `_get_connection_type`
        (collector.py:849-865): a `wireless` boolean always wins, but a
        device that omits it can still be classified from its own
        `connection_type` field.
        """
        raw = {"url": "/devices/1", "connection_type": "Wireless"}
        assert normalize_device(raw)["connection_type"] == "wireless"

    def test_connection_type_unknown_when_indeterminate(self):
        """A device with neither `wireless` nor a recognizable
        `connection_type` field must be "unknown", never silently folded
        into "wired" (eero-ui#413: this is what caused the wireless/wired
        client-count split to lose devices across the 6.0 collector
        migration instead of reclassifying them).
        """
        assert normalize_device({"url": "/devices/1"})["connection_type"] == "unknown"
        assert (
            normalize_device({"url": "/devices/1", "connection_type": "ethernet"})[
                "connection_type"
            ]
            == "unknown"
        )

    def test_connected_flag_defaults_false(self):
        """A device with no `connected` key must normalize to False, not None."""
        assert normalize_device({"url": "/devices/1"})["connected"] is False

    def test_extracts_connectivity_info(self):
        """Should extract signal and frequency from connectivity."""
        raw = {
            "url": "/devices/1",
            "connectivity": {"signal": "-45 dBm", "frequency": 5200, "score_bars": 4},
        }
        result = normalize_device(raw)
        assert result["signal_strength"] == -45
        assert result["frequency"] == "5GHz"
        assert result["signal_bars"] == 4

    def test_classifies_2_4ghz_band(self):
        """Frequencies below 4000 MHz should be reported as 2.4GHz."""
        raw = {"url": "/devices/1", "connectivity": {"frequency": 2437}}
        assert normalize_device(raw)["frequency"] == "2.4GHz"

    def test_classifies_6ghz_band(self):
        """Frequencies at or above 5925 MHz should be reported as 6GHz.

        Wi-Fi 6E/7 use the 6 GHz band (5925-7125 MHz). Previously these
        were mislabeled as 5GHz (see issue #202).
        """
        raw = {"url": "/devices/1", "connectivity": {"frequency": 6175}}
        assert normalize_device(raw)["frequency"] == "6GHz"
        # Boundary: channel 1 center frequency in the 6 GHz band
        raw_boundary = {"url": "/devices/1", "connectivity": {"frequency": 5955}}
        assert normalize_device(raw_boundary)["frequency"] == "6GHz"
        # Just below the boundary stays on 5 GHz
        raw_5ghz_top = {"url": "/devices/1", "connectivity": {"frequency": 5825}}
        assert normalize_device(raw_5ghz_top)["frequency"] == "5GHz"

    def test_extracts_source_eero(self):
        """Should extract connected eero info from source."""
        raw = {
            "url": "/devices/1",
            "source": {
                "location": "Living Room",
                "model": "eero Pro",
                "url": "/2.2/eeros/eero123",
            },
        }
        result = normalize_device(raw)
        assert result["connected_to_eero"] == "Living Room"
        assert result["connected_to_eero_id"] == "eero123"
        assert result["connected_to_eero_model"] == "eero Pro"

    def test_creates_display_name_fallback(self):
        """Should create display_name from nickname or hostname."""
        raw1 = {"url": "/devices/1", "nickname": "My Phone"}
        raw2 = {"url": "/devices/1", "hostname": "iphone-12"}
        raw3 = {"url": "/devices/1", "display_name": "Explicit Name"}
        assert normalize_device(raw1)["display_name"] == "My Phone"
        assert normalize_device(raw2)["display_name"] == "iphone-12"
        assert normalize_device(raw3)["display_name"] == "Explicit Name"


class TestNormalizeEero:
    """Tests for normalize_eero function."""

    def test_extracts_id_from_url(self):
        """Should extract eero ID from URL."""
        raw = {"url": "/2.2/eeros/eero789", "serial": "SN123"}
        result = normalize_eero(raw)
        assert result["id"] == "eero789"

    def test_handles_gateway_flag(self):
        """Should handle both gateway and is_gateway flags."""
        raw1 = {"url": "/eeros/1", "gateway": True}
        raw2 = {"url": "/eeros/1", "is_gateway": True}
        assert normalize_eero(raw1)["is_gateway"] is True
        assert normalize_eero(raw2)["is_gateway"] is True

    def test_extracts_firmware_version(self):
        """Should extract firmware from multiple possible fields."""
        raw1 = {"url": "/eeros/1", "firmware_version": "7.0.0"}
        raw2 = {"url": "/eeros/1", "os_version": "7.1.0"}
        raw3 = {"url": "/eeros/1", "os": "7.2.0"}
        assert normalize_eero(raw1)["firmware_version"] == "7.0.0"
        assert normalize_eero(raw2)["firmware_version"] == "7.1.0"
        assert normalize_eero(raw3)["firmware_version"] == "7.2.0"

    def test_handles_location_string(self):
        """Should handle location as string."""
        raw = {"url": "/eeros/1", "location": "Living Room"}
        result = normalize_eero(raw)
        assert result["location"] == "Living Room"

    def test_handles_location_dict(self):
        """Should extract location from dict."""
        raw = {"url": "/eeros/1", "location": {"address": "Kitchen"}}
        result = normalize_eero(raw)
        assert result["location"] == "Kitchen"

    def test_unwraps_nested_status_dict(self):
        """Should unwrap a nested status object to a plain string."""
        raw = {"url": "/eeros/1", "status": {"status": "green"}}
        result = normalize_eero(raw)
        assert result["status"] == "green"

    def test_coerces_dict_shaped_client_counts(self):
        """Should coerce dict-shaped numeric count fields to ints."""
        raw = {
            "url": "/eeros/1",
            "connected_clients_count": {"count": 9},
            "mesh_quality_bars": {"value": 4},
        }
        result = normalize_eero(raw)
        assert result["connected_clients_count"] == 9
        assert result["mesh_quality_bars"] == 4

    def test_connected_clients_count_defaults_to_zero(self):
        """Should default connected_clients_count to 0 when absent or null."""
        assert normalize_eero({"url": "/eeros/1"})["connected_clients_count"] == 0
        raw = {"url": "/eeros/1", "connected_clients_count": None}
        assert normalize_eero(raw)["connected_clients_count"] == 0

    def test_coerces_object_shaped_update_available(self):
        """Should coerce an object-shaped update_available to a bool."""
        raw = {"url": "/eeros/1", "update_available": {"min_firmware": "7.5"}}
        assert normalize_eero(raw)["update_available"] is True

    def test_coerces_string_booleans(self):
        """Should coerce string boolean values to real booleans."""
        raw = {"url": "/eeros/1", "led_on": "true", "heartbeat_ok": "false"}
        result = normalize_eero(raw)
        assert result["led_on"] is True
        assert result["heartbeat_ok"] is False

    def test_sanitizes_malformed_bands_list(self):
        """Should drop non-scalar band entries so the value stays list[str]."""
        raw = {"url": "/eeros/1", "bands": [{"band": "2.4"}, {"band": "5"}]}
        assert normalize_eero(raw)["bands"] is None

    def test_keeps_valid_string_lists(self):
        """Should keep well-formed string lists unchanged."""
        raw = {
            "url": "/eeros/1",
            "bands": ["2.4", "5"],
            "ethernet_addresses": ["AA:BB:CC:DD:EE:FF"],
        }
        result = normalize_eero(raw)
        assert result["bands"] == ["2.4", "5"]
        assert result["ethernet_addresses"] == ["AA:BB:CC:DD:EE:FF"]


class TestNormalizeProfile:
    """Tests for normalize_profile function."""

    def test_extracts_id_from_url(self):
        """Should extract profile ID from URL."""
        raw = {"url": "/2.2/profiles/prof123", "name": "Kids"}
        result = normalize_profile(raw)
        assert result["id"] == "prof123"

    def test_extracts_devices(self):
        """Should extract and normalize devices list."""
        raw = {
            "url": "/profiles/1",
            "name": "Test",
            "devices": [
                {"url": "/devices/dev1", "nickname": "Phone"},
                {"url": "/devices/dev2", "hostname": "tablet"},
            ],
        }
        result = normalize_profile(raw)
        assert result["device_count"] == 2
        assert len(result["devices"]) == 2
        assert result["device_ids"] == ["dev1", "dev2"]

    def test_handles_nested_devices(self):
        """Should handle nested devices structure."""
        raw = {
            "url": "/profiles/1",
            "name": "Test",
            "devices": {"data": [{"url": "/devices/d1"}]},
        }
        result = normalize_profile(raw)
        assert result["device_count"] == 1


class TestNormalizeDns:
    """Tests for normalize_dns function."""

    def test_normalizes_full_shape(self):
        """Should normalize both address families, caching and providers."""
        raw_network = {
            "dns": {
                "mode": "custom",
                "custom": {"ips": ["1.1.1.1", "1.0.0.1"]},
                "parent": {"ips": ["8.8.8.8"]},
                "caching": True,
                "default_test_servers": [
                    {
                        "name": "Cloudflare",
                        "ipv4": ["1.1.1.1", "1.0.0.1"],
                        "ipv6": ["2606:4700:4700::1111", "2606:4700:4700::1001"],
                    }
                ],
            },
            "ipv6": {
                "name_servers": {
                    "mode": "custom",
                    "custom": ["2606:4700:4700:0:0:0:0:1111"],
                }
            },
        }

        result = normalize_dns(raw_network)

        assert result["ipv4"] == {"mode": "custom", "servers": ["1.1.1.1", "1.0.0.1"]}
        # Fully-expanded IPv6 from the API is compressed on read.
        assert result["ipv6"] == {
            "mode": "custom",
            "servers": ["2606:4700:4700::1111"],
        }
        assert result["caching"] is True
        assert result["parent_ips"] == ["8.8.8.8"]
        assert result["providers"] == [
            {
                "name": "Cloudflare",
                "ipv4": ["1.1.1.1", "1.0.0.1"],
                "ipv6": ["2606:4700:4700::1111", "2606:4700:4700::1001"],
            }
        ]

    def test_tolerates_missing_dns_key(self):
        """A network payload without a dns key should yield defaults."""
        result = normalize_dns({})

        assert result["ipv4"] == {"mode": "automatic", "servers": []}
        assert result["ipv6"] == {"mode": "automatic", "servers": []}
        assert result["caching"] is False
        assert result["parent_ips"] == []
        assert result["providers"] == []

    def test_tolerates_dns_none(self):
        """A network payload with dns=None should yield defaults, not raise."""
        result = normalize_dns({"dns": None})

        assert result["ipv4"] == {"mode": "automatic", "servers": []}
        assert result["caching"] is False

    def test_tolerates_missing_ipv6_key(self):
        """A network payload with no ipv6 key at all should not raise."""
        raw_network = {
            "dns": {"mode": "custom", "custom": {"ips": ["1.1.1.1"]}},
        }

        result = normalize_dns(raw_network)

        assert result["ipv4"] == {"mode": "custom", "servers": ["1.1.1.1"]}
        assert result["ipv6"] == {"mode": "automatic", "servers": []}

    def test_tolerates_ipv6_container_not_a_dict(self):
        """A malformed ipv6 value should be ignored rather than raise."""
        result = normalize_dns({"ipv6": "not-a-dict"})

        assert result["ipv6"] == {"mode": "automatic", "servers": []}

    def test_skips_unparseable_ip_entries(self):
        """Unparseable entries in a server list are dropped, not raised."""
        raw_network = {
            "dns": {"mode": "custom", "custom": {"ips": ["1.1.1.1", "not-an-ip"]}},
        }

        result = normalize_dns(raw_network)

        assert result["ipv4"]["servers"] == ["1.1.1.1"]

    def test_filters_entries_by_family(self):
        """An IPv6 literal in the ipv4 custom list is filtered out on read."""
        raw_network = {
            "dns": {
                "mode": "custom",
                "custom": {"ips": ["1.1.1.1", "2606:4700:4700::1111"]},
            },
        }

        result = normalize_dns(raw_network)

        assert result["ipv4"]["servers"] == ["1.1.1.1"]

    def test_defaults_missing_mode_to_automatic(self):
        """A missing mode field defaults to automatic for both families."""
        raw_network = {
            "dns": {"custom": {"ips": ["1.1.1.1"]}},
            "ipv6": {"name_servers": {"custom": ["2606:4700:4700::1111"]}},
        }

        result = normalize_dns(raw_network)

        assert result["ipv4"]["mode"] == "automatic"
        assert result["ipv6"]["mode"] == "automatic"


class TestCheckSuccess:
    """Tests for check_success function."""

    def test_success_with_code_200(self):
        """Should return True for code 200."""
        response = {"meta": {"code": 200}, "data": {}}
        assert check_success(response) is True

    def test_failure_with_error_code(self):
        """Should return False for error codes."""
        response = {"meta": {"code": 401}, "data": {}}
        assert check_success(response) is False

    def test_success_with_bool_response(self):
        """Should handle boolean responses."""
        assert check_success(True) is True
        assert check_success(False) is False

    def test_failure_with_none(self):
        """Should return False for None."""
        assert check_success(None) is False


class TestNormalizeSpeedTest:
    """Tests for normalize_speed_test: the shape shared by
    routes/networks.py's speedtest history route and services/collector.py
    (phase-6.0-revamp.md § 3.3, § 8.1)."""

    def test_full_entry_extracts_all_fields(self):
        """down/up nested values, latency and date all surface at top level."""
        raw = {
            "down": {"value": 250.5},
            "up": {"value": 20.1},
            "latency": 12.3,
            "date": "2026-01-01T00:00:00Z",
        }

        result = normalize_speed_test(raw)

        assert result == {
            "down_mbps": 250.5,
            "up_mbps": 20.1,
            "latency_ms": 12.3,
            "date": "2026-01-01T00:00:00Z",
        }

    def test_missing_down_and_up_yield_none(self):
        """An entry with neither down nor up still normalizes cleanly."""
        result = normalize_speed_test({"date": "2026-01-01T00:00:00Z"})

        assert result["down_mbps"] is None
        assert result["up_mbps"] is None
        assert result["latency_ms"] is None
        assert result["date"] == "2026-01-01T00:00:00Z"

    def test_non_dict_down_or_up_does_not_raise(self):
        """A malformed (non-dict) down/up value is treated as absent, not
        as an AttributeError from calling .get() on it."""
        result = normalize_speed_test({"down": "not-a-dict", "up": None})

        assert result["down_mbps"] is None
        assert result["up_mbps"] is None

    def test_non_dict_input_does_not_raise(self):
        """A completely malformed entry (not even a dict) normalizes to
        all-None rather than raising."""
        result = normalize_speed_test("not-a-dict")

        assert result == {
            "down_mbps": None,
            "up_mbps": None,
            "latency_ms": None,
            "date": None,
        }

    def test_accepts_bare_number_down_and_up(self):
        """down/up sent as bare numbers (not the {"value": n} wrapper) are
        accepted, not silently dropped to None."""
        result = normalize_speed_test({"down": 250.5, "up": 20.1})

        assert result["down_mbps"] == 250.5
        assert result["up_mbps"] == 20.1

    def test_bool_down_or_up_is_not_treated_as_numeric(self):
        """bool is an int subclass in Python; must not be coerced to 0.0/1.0."""
        result = normalize_speed_test({"down": True, "up": False})

        assert result["down_mbps"] is None
        assert result["up_mbps"] is None

    def test_accepts_timestamp_key(self):
        """Accepts 'timestamp' as an alternative to 'date'."""
        result = normalize_speed_test({"timestamp": "2026-01-01T00:00:00Z"})

        assert result["date"] == "2026-01-01T00:00:00Z"

    def test_accepts_created_at_key(self):
        """Accepts 'created_at' as an alternative to 'date'."""
        result = normalize_speed_test({"created_at": "2026-01-01T00:00:00Z"})

        assert result["date"] == "2026-01-01T00:00:00Z"

    def test_naive_date_gets_utc_offset_appended(self):
        """A naive date (eero's own values are UTC) becomes tz-aware so the
        frontend's newer-than-started_at comparison never mis-parses it as
        local time."""
        result = normalize_speed_test({"date": "2026-01-01T00:00:00"})

        assert result["date"] == "2026-01-01T00:00:00+00:00"

    def test_already_tz_aware_date_is_unchanged(self):
        """A date that already carries an offset is returned unchanged, not
        reformatted (e.g. 'Z' is preserved rather than rewritten to
        '+00:00')."""
        result = normalize_speed_test({"date": "2026-01-01T00:00:00Z"})

        assert result["date"] == "2026-01-01T00:00:00Z"

    def test_nested_under_speed_wrapper(self):
        """down/up nested under a top-level `speed` key (the shape the
        network envelope uses for its own embedded single result, per
        eero-api tests/api/conftest.py sample_network_data) are accepted
        for history entries too (eero-ui#413)."""
        raw = {
            "date": "2026-01-01T00:00:00Z",
            "speed": {
                "down": {"value": 500.0, "units": "Mbps"},
                "up": {"value": 50.0, "units": "Mbps"},
            },
        }

        result = normalize_speed_test(raw)

        assert result["down_mbps"] == 500.0
        assert result["up_mbps"] == 50.0

    def test_download_upload_key_names(self):
        """`download`/`upload` are accepted as alternatives to `down`/`up`."""
        raw = {"download": {"value": 300.0}, "upload": {"value": 25.0}}

        result = normalize_speed_test(raw)

        assert result["down_mbps"] == 300.0
        assert result["up_mbps"] == 25.0

    def test_download_mbps_upload_mbps_bare_numeric_fields(self):
        """`download_mbps`/`upload_mbps` bare numeric fields are accepted."""
        raw = {"download_mbps": 400.0, "upload_mbps": 40.0}

        result = normalize_speed_test(raw)

        assert result["down_mbps"] == 400.0
        assert result["up_mbps"] == 40.0

    def test_down_mbps_up_mbps_bare_numeric_fields(self):
        """The short `down_mbps`/`up_mbps` spelling is accepted too."""
        raw = {"down_mbps": 410.0, "up_mbps": 41.0}

        result = normalize_speed_test(raw)

        assert result["down_mbps"] == 410.0
        assert result["up_mbps"] == 41.0

    def test_latency_ms_key(self):
        """`latency_ms` is accepted as an alternative to `latency`."""
        result = normalize_speed_test({"latency_ms": 15.5})

        assert result["latency_ms"] == 15.5

    def test_ping_key(self):
        """`ping` is accepted as an alternative to `latency`/`latency_ms`."""
        result = normalize_speed_test({"ping": 9.0})

        assert result["latency_ms"] == 9.0

    def test_latency_as_value_wrapper(self):
        """Latency sent as a {"value": n} wrapper (like down/up) is unwrapped."""
        result = normalize_speed_test({"latency": {"value": 11.0, "units": "ms"}})

        assert result["latency_ms"] == 11.0

    def test_kbps_units_converted_to_mbps(self):
        """A `units` of "Kbps" is converted to Mbps, not treated as already-Mbps."""
        result = normalize_speed_test({"down": {"value": 500000.0, "units": "Kbps"}})

        assert result["down_mbps"] == 500.0

    def test_gbps_units_converted_to_mbps(self):
        """A `units` of "Gbps" is converted to Mbps, not treated as already-Mbps."""
        result = normalize_speed_test({"up": {"value": 1.0, "units": "Gbps"}})

        assert result["up_mbps"] == 1000.0

    def test_top_level_down_up_take_priority_over_speed_wrapper(self):
        """When both top-level and `speed`-nested down/up are present, the
        top-level value wins (it is the more specific, entry-level shape)."""
        raw = {
            "down": {"value": 100.0},
            "speed": {"down": {"value": 999.0}},
        }

        result = normalize_speed_test(raw)

        assert result["down_mbps"] == 100.0

    def test_unparseable_date_is_returned_unchanged(self):
        """A malformed date string is passed through rather than raising."""
        result = normalize_speed_test({"date": "not-a-date"})

        assert result["date"] == "not-a-date"
