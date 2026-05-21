"""Unit tests for the _coercion module.

Tests cover:
- coerce_numeric with int, float, str, dict, None, and other types
- Dict key probe order (seconds, value, current, total, count)
- Unknown dict shapes return None and log once (dedup)
- Recursive dict coercion
- Boolean inputs treated as non-numeric
"""

import logging
from unittest.mock import AsyncMock, patch

import pytest

from app._coercion import _UNKNOWN_DICT_LOGGED, coerce_numeric


# ========================== coerce_numeric Tests ==========================


class TestCoerceNumericScalars:
    """Tests for scalar (int, float, str, None) inputs."""

    def setup_method(self):
        """Clear dedup set before each test."""
        _UNKNOWN_DICT_LOGGED.clear()

    def test_int_returns_float(self):
        """Int input is returned as float."""
        result = coerce_numeric(1000)
        assert result == 1000.0
        assert isinstance(result, float)

    def test_float_returns_float(self):
        """Float input is returned as float."""
        result = coerce_numeric(3.14)
        assert result == 3.14

    def test_zero_int(self):
        """Zero int returns 0.0, not None."""
        assert coerce_numeric(0) == 0.0

    def test_zero_float(self):
        """Zero float returns 0.0, not None."""
        assert coerce_numeric(0.0) == 0.0

    def test_none_returns_none(self):
        """None input returns None."""
        assert coerce_numeric(None) is None

    def test_bool_true_returns_none(self):
        """True is a bool subclass of int but should not be coerced."""
        assert coerce_numeric(True) is None

    def test_bool_false_returns_none(self):
        """False is a bool subclass of int but should not be coerced."""
        assert coerce_numeric(False) is None

    def test_numeric_string(self):
        """Numeric string is parsed to float."""
        assert coerce_numeric("42") == 42.0
        assert coerce_numeric("3.14") == 3.14

    def test_non_numeric_string_returns_none(self):
        """Non-numeric string returns None."""
        assert coerce_numeric("not-a-number") is None
        assert coerce_numeric("") is None

    def test_list_returns_none(self):
        """List input returns None."""
        assert coerce_numeric([1, 2, 3]) is None

    def test_object_returns_none(self):
        """Arbitrary object returns None."""
        assert coerce_numeric(object()) is None


class TestCoerceNumericDict:
    """Tests for dict inputs probing candidate keys."""

    def setup_method(self):
        """Clear dedup set before each test."""
        _UNKNOWN_DICT_LOGGED.clear()

    def test_seconds_key(self):
        """Dict with 'seconds' key returns that value."""
        assert coerce_numeric({"seconds": 1000, "human": "16m"}) == 1000.0

    def test_value_key(self):
        """Dict with 'value' key returns that value."""
        assert coerce_numeric({"value": 42}) == 42.0

    def test_current_key(self):
        """Dict with 'current' key returns that value."""
        assert coerce_numeric({"current": 99}) == 99.0

    def test_total_key(self):
        """Dict with 'total' key returns that value."""
        assert coerce_numeric({"total": 500}) == 500.0

    def test_count_key(self):
        """Dict with 'count' key returns that value."""
        assert coerce_numeric({"count": 7}) == 7.0

    def test_seconds_takes_priority_over_value(self):
        """'seconds' is probed before 'value'."""
        result = coerce_numeric({"seconds": 100, "value": 999})
        assert result == 100.0

    def test_recursive_dict(self):
        """Nested dict value is recursively coerced."""
        result = coerce_numeric({"seconds": {"value": 55}})
        assert result == 55.0

    def test_unknown_dict_returns_none(self):
        """Dict with no candidate keys returns None."""
        result = coerce_numeric({"foo": 1, "bar": 2}, field_name="uptime")
        assert result is None

    def test_unknown_dict_logs_once(self, caplog):
        """Unknown dict shape is logged at DEBUG exactly once per unique shape."""
        with caplog.at_level(logging.DEBUG, logger="app._coercion"):
            coerce_numeric({"foo": 1}, field_name="uptime")
            coerce_numeric({"foo": 1}, field_name="uptime")  # duplicate — no extra log

        debug_records = [
            r for r in caplog.records if "unknown dict shape" in r.message
        ]
        assert len(debug_records) == 1

    def test_different_unknown_shapes_each_logged_once(self, caplog):
        """Different unknown shapes each get their own log entry."""
        with caplog.at_level(logging.DEBUG, logger="app._coercion"):
            coerce_numeric({"foo": 1}, field_name="uptime")
            coerce_numeric({"bar": 2}, field_name="uptime")

        debug_records = [
            r for r in caplog.records if "unknown dict shape" in r.message
        ]
        assert len(debug_records) == 2

    def test_empty_dict_returns_none(self):
        """Empty dict has no candidate keys, returns None."""
        assert coerce_numeric({}) is None


# ========================== Route Regression Tests ==========================


class TestEerosRouteUptimeCoercion:
    """Regression tests for the uptime-dict-500 bug (upstream #61).

    Simulates the Eero Cloud API returning uptime as a dict and asserts
    the /api/networks/{id}/eeros/{eero_id} endpoint returns HTTP 200
    with the correct integer uptime value.
    """

    @pytest.fixture
    def sample_eero_raw(self):
        """Minimal raw eero payload with uptime as a dict."""
        return {
            "url": "/2.2/eeros/eero-abc",
            "serial": "SN-001",
            "mac_address": "AA:BB:CC:DD:EE:FF",
            "model": "eero Pro 6",
            "status": "online",
            "location": "Living Room",
            "is_gateway": True,
            "is_primary": True,
            "connected_clients_count": 5,
            "firmware_version": "7.0.0",
            "uptime": {"seconds": 1000, "human": "16m"},
            "cpu_usage": 12.5,
            "memory_usage": 45.0,
            "temperature": 55.0,
        }

    async def test_uptime_dict_returns_200(
        self, auth_client, authenticated_client, sample_eero_raw
    ):
        """Endpoint returns 200 when uptime is a dict with 'seconds' key."""
        authenticated_client.get_eero = AsyncMock(
            return_value={
                "meta": {"code": 200},
                "data": sample_eero_raw,
            }
        )

        response = await auth_client.get("/api/eeros/eero-abc")

        assert response.status_code == 200
        data = response.json()
        assert data["uptime"] == 1000

    async def test_uptime_dict_value_key_returns_200(
        self, auth_client, authenticated_client, sample_eero_raw
    ):
        """Endpoint handles dict with 'value' key correctly."""
        raw = dict(sample_eero_raw)
        raw["uptime"] = {"value": 2500}
        authenticated_client.get_eero = AsyncMock(
            return_value={"meta": {"code": 200}, "data": raw}
        )

        response = await auth_client.get("/api/eeros/eero-abc")

        assert response.status_code == 200
        assert response.json()["uptime"] == 2500

    async def test_uptime_plain_int_still_works(
        self, auth_client, authenticated_client, sample_eero_raw
    ):
        """Normal numeric uptime continues to work after the fix."""
        raw = dict(sample_eero_raw)
        raw["uptime"] = 86400
        authenticated_client.get_eero = AsyncMock(
            return_value={"meta": {"code": 200}, "data": raw}
        )

        response = await auth_client.get("/api/eeros/eero-abc")

        assert response.status_code == 200
        assert response.json()["uptime"] == 86400

    async def test_uptime_none_falls_back_to_last_reboot(
        self, auth_client, authenticated_client, sample_eero_raw
    ):
        """When uptime is absent, last_reboot fallback is used."""
        raw = dict(sample_eero_raw)
        raw["uptime"] = None
        raw["last_reboot"] = "2026-05-20T12:00:00Z"
        authenticated_client.get_eero = AsyncMock(
            return_value={"meta": {"code": 200}, "data": raw}
        )

        response = await auth_client.get("/api/eeros/eero-abc")

        assert response.status_code == 200
        # Uptime calculated from last_reboot should be a positive integer
        assert response.json()["uptime"] is not None
        assert response.json()["uptime"] > 0

    async def test_uptime_unknown_dict_returns_200_with_none(
        self, auth_client, authenticated_client, sample_eero_raw
    ):
        """Unknown dict shape degrades to None (or last_reboot fallback)."""
        raw = dict(sample_eero_raw)
        raw["uptime"] = {"mystery_key": 999}
        raw["last_reboot"] = None
        authenticated_client.get_eero = AsyncMock(
            return_value={"meta": {"code": 200}, "data": raw}
        )

        response = await auth_client.get("/api/eeros/eero-abc")

        # Must not 500
        assert response.status_code == 200
        assert response.json()["uptime"] is None

    async def test_cpu_usage_dict_coerced(
        self, auth_client, authenticated_client, sample_eero_raw
    ):
        """cpu_usage dict is coerced to float correctly."""
        raw = dict(sample_eero_raw)
        raw["cpu_usage"] = {"value": 23.7}
        authenticated_client.get_eero = AsyncMock(
            return_value={"meta": {"code": 200}, "data": raw}
        )

        response = await auth_client.get("/api/eeros/eero-abc")

        assert response.status_code == 200
        assert response.json()["cpu_usage"] == pytest.approx(23.7)
