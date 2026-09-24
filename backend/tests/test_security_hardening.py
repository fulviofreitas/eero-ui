"""Tests for the WP7 security-review hardening pass on the WP6 routes.

Covers, in order: fail-soft routes re-raising auth/rate-limit/client-blocked
before swallowing into a fail-soft result; rate limits added to the guest
password, device-type and LED-brightness writes; data-usage and
channel-utilization range/timezone validation; the speed-test in-flight
guard being cleared on a failed kickoff; and the shared
``strip_sensitive_keys``/``validate_path_id`` helpers in transformers.py.
"""

from unittest.mock import AsyncMock

import pytest
from eero.exceptions import EeroAuthenticationException, EeroException

from app.routes.auth import limiter
from app.transformers import (
    InvalidIdentifierError,
    strip_sensitive_keys,
    validate_path_id,
)


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


@pytest.fixture(autouse=True)
def _reset_limiter():
    """The shared slowapi ``Limiter`` is process-global state (see the
    coordinator's audit note in ``test_networks.py``'s speedtest class) -
    reset before and after every test in this module so rate-limit tests
    never leak their budget into each other or into other test modules.
    """
    limiter.reset()
    yield
    limiter.reset()


class TestFailSoftPropagatesAuth:
    """A dead session must still 401 (and clear the token) even from inside
    a fail-soft ``except EeroException`` block - never degrade to a
    fail-soft empty/None result for an expired session."""

    async def test_entitlements_propagates_authentication_exception(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_entitlement_features = AsyncMock(
            side_effect=EeroAuthenticationException("session dead")
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 401

    async def test_backup_internet_propagates_authentication_exception(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_backup_internet = AsyncMock(
            side_effect=EeroAuthenticationException("session dead")
        )

        response = await auth_client.get("/api/networks/net-1/backup-internet")

        assert response.status_code == 401

    async def test_security_settings_propagates_authentication_exception(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_security_settings = AsyncMock(
            side_effect=EeroAuthenticationException("session dead")
        )

        response = await auth_client.get("/api/networks/net-1/security")

        assert response.status_code == 401

    async def test_notifications_propagates_authentication_exception(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_notification_settings = AsyncMock(
            side_effect=EeroAuthenticationException("session dead")
        )

        response = await auth_client.get("/api/networks/net-1/notifications")

        assert response.status_code == 401

    async def test_non_auth_eero_exception_still_fails_soft(
        self, auth_client, authenticated_client
    ):
        """A plain EeroException (not auth/rate-limit/client-blocked) keeps
        the existing fail-soft behaviour - this is a regression guard, not
        a new contract."""
        authenticated_client.get_entitlement_features = AsyncMock(
            side_effect=EeroException("transient")
        )
        authenticated_client.get_upsell_features = AsyncMock(
            return_value=make_raw_response({"upsell_features": []})
        )
        authenticated_client.get_model_capabilities = AsyncMock(
            return_value=make_raw_response({"models": []})
        )
        authenticated_client.get_premium_customer = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_premium_status = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        assert response.json()["features"] == []


class TestGuestPasswordRateLimit:
    """PUT/DELETE guest/password share a 5/minute limit (security review,
    2026-09-24)."""

    async def test_sixth_set_within_a_minute_is_rate_limited(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_guest_password = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_guest_network = AsyncMock(
            return_value=make_raw_response({"enabled": True, "name": "guest"})
        )

        last_status = None
        for _ in range(6):
            response = await auth_client.put(
                "/api/networks/net-1/guest/password",
                json={"password": "correct-horse-battery"},
            )
            last_status = response.status_code

        assert last_status == 429

    async def test_set_and_clear_share_one_budget(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_guest_password = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.clear_guest_password = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_guest_network = AsyncMock(
            return_value=make_raw_response({"enabled": True, "name": "guest"})
        )

        for _ in range(5):
            await auth_client.put(
                "/api/networks/net-1/guest/password",
                json={"password": "correct-horse-battery"},
            )
        response = await auth_client.delete("/api/networks/net-1/guest/password")

        assert response.status_code == 429


class TestDeviceTypeRateLimit:
    async def test_eleventh_write_within_a_minute_is_rate_limited(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_device_type = AsyncMock(
            return_value=make_raw_response({})
        )

        last_status = None
        for _ in range(11):
            response = await auth_client.put(
                "/api/devices/device-1/type", json={"device_type": "laptop"}
            )
            last_status = response.status_code

        assert last_status == 429


class TestLedBrightnessRateLimit:
    async def test_eleventh_write_within_a_minute_is_rate_limited(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_led_brightness = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_led_status = AsyncMock(
            return_value=make_raw_response({"led_brightness": 50})
        )

        last_status = None
        for _ in range(11):
            response = await auth_client.put(
                "/api/eeros/eero-1/led/brightness", params={"brightness": 50}
            )
            last_status = response.status_code

        assert last_status == 429


class TestDataUsageWindowCaps:
    async def test_hourly_window_over_31_days_rejected(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-03-01T00:00:00Z",
                "cadence": "hourly",
            },
        )

        assert response.status_code == 400
        assert "31 days" in response.json()["detail"]

    async def test_daily_window_over_366_days_rejected(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={
                "start": "2020-01-01T00:00:00Z",
                "end": "2026-01-01T00:00:00Z",
                "cadence": "daily",
            },
        )

        assert response.status_code == 400

    async def test_naive_and_aware_timestamps_do_not_500(
        self, auth_client, authenticated_client
    ):
        """A naive start alongside a Z-suffixed end must compare cleanly,
        not raise TypeError (security review, 2026-09-24)."""
        authenticated_client.get_data_usage = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={
                "start": "2026-01-01T00:00:00",
                "end": "2026-01-02T00:00:00Z",
                "cadence": "daily",
            },
        )

        assert response.status_code == 200

    async def test_invalid_timezone_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-01-02T00:00:00Z",
                "cadence": "daily",
                "timezone": "Not/AZone",
            },
        )

        assert response.status_code == 400

    async def test_valid_timezone_accepted(self, auth_client, authenticated_client):
        authenticated_client.get_data_usage = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.get(
            "/api/networks/net-1/data-usage",
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-01-02T00:00:00Z",
                "cadence": "daily",
                "timezone": "America/New_York",
            },
        )

        assert response.status_code == 200


class TestChannelUtilizationValidation:
    async def test_end_before_start_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/channel-utilization",
            params={"start": "2026-01-02T00:00:00Z", "end": "2026-01-01T00:00:00Z"},
        )

        assert response.status_code == 400

    async def test_window_over_31_days_rejected(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(
            "/api/networks/net-1/channel-utilization",
            params={"start": "2026-01-01T00:00:00Z", "end": "2026-03-01T00:00:00Z"},
        )

        assert response.status_code == 400

    async def test_granularity_out_of_bounds_rejected(
        self, auth_client, authenticated_client
    ):
        response = await auth_client.get(
            "/api/networks/net-1/channel-utilization",
            params={
                "start": "2026-01-01T00:00:00Z",
                "end": "2026-01-02T00:00:00Z",
                "granularity": 0,
            },
        )

        assert response.status_code == 422


class TestSpeedTestGuardClearedOnFailure:
    async def test_failed_kickoff_does_not_block_a_retry(
        self, auth_client, authenticated_client
    ):
        authenticated_client.run_speed_test = AsyncMock(
            side_effect=EeroException("kickoff failed")
        )

        first = await auth_client.post("/api/networks/net-1/speedtest")
        assert first.status_code == 500

        authenticated_client.run_speed_test = AsyncMock(
            return_value=make_raw_response(None, code=202)
        )
        second = await auth_client.post("/api/networks/net-1/speedtest")

        assert second.status_code == 202


class TestStripSensitiveKeys:
    def test_strips_password_and_token_shaped_keys_recursively(self):
        raw = {
            "ssid": "backup-net",
            "password": "super-secret",
            "nested": {"api_token": "abc", "keep": "me"},
            "list": [{"psk": "xyz", "safe": 1}],
        }

        cleaned = strip_sensitive_keys(raw)

        assert cleaned == {
            "ssid": "backup-net",
            "nested": {"keep": "me"},
            "list": [{"safe": 1}],
        }

    def test_scalars_and_lists_pass_through(self):
        assert strip_sensitive_keys("plain") == "plain"
        assert strip_sensitive_keys([1, 2, 3]) == [1, 2, 3]
        assert strip_sensitive_keys(None) is None


class TestValidatePathId:
    def test_accepts_plain_identifier(self):
        assert validate_path_id("abc123") == "abc123"

    def test_rejects_empty(self):
        with pytest.raises(InvalidIdentifierError):
            validate_path_id("")

    def test_rejects_path_traversal(self):
        with pytest.raises(InvalidIdentifierError):
            validate_path_id("../../etc/passwd")

    def test_rejects_embedded_newline(self):
        with pytest.raises(InvalidIdentifierError):
            validate_path_id("abc\n")
