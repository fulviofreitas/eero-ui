"""Tests for the write-path security hardening added 2026-09-24 (security review).

Covers:
1. Rate limiting + a per-network in-flight guard on
   ``POST /api/networks/{id}/speedtest``.
2. Static-422 rejection of oversized/control-character network names in
   ``PUT /api/networks/{id}/name``.
3. Static-422 rejection of control-character device nicknames in
   ``PUT /api/devices/{id}/nickname``.
4. The ``sdk_get_retries`` setting is clamped to [0, 3].

Kept in its own file per the coordinator's instruction, since TEST-SME is
concurrently editing the other backend/tests/*.py files.
"""

from unittest.mock import AsyncMock

import pytest

from app.config import get_settings

# ``limiter`` (slowapi) and ``_last_speed_test_started`` are module-level,
# process-global singletons; conftest.py's ``_reset_rate_limiter``/
# ``_reset_networks_module_state`` autouse fixtures reset both before and
# after every test in the whole session, so no file-local reset is needed
# here.


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


sample_network = {
    "url": "/2.2/networks/net-1",
    "name": "Home",
    "status": "online",
    "guest_network_enabled": False,
}


class TestSpeedTestRateLimit:
    """networks.py:281-301 - rate limiting on POST .../speedtest."""

    async def test_third_call_within_a_minute_is_rate_limited(
        self, auth_client, authenticated_client
    ):
        """The route is limited to 2/minute per IP; a third call in the
        same window returns 429."""
        authenticated_client.run_speed_test = AsyncMock(
            return_value=make_raw_response(None, code=202)
        )

        # Two different networks so the in-flight guard (keyed by
        # network_id) never fires - this test is purely about the IP-based
        # rate limiter.
        r1 = await auth_client.post("/api/networks/net-1/speedtest")
        r2 = await auth_client.post("/api/networks/net-2/speedtest")
        r3 = await auth_client.post("/api/networks/net-3/speedtest")

        assert r1.status_code == 202
        assert r2.status_code == 202
        assert r3.status_code == 429


class TestSpeedTestInFlightGuard:
    """networks.py:281-301 - the per-network in-flight guard."""

    async def test_second_call_for_same_network_within_90s_returns_409(
        self, auth_client, authenticated_client
    ):
        """A second speed test for the same network within 90s is rejected
        with 409 speedtest_in_progress, and does not call the SDK again."""
        authenticated_client.run_speed_test = AsyncMock(
            return_value=make_raw_response(None, code=202)
        )

        first = await auth_client.post("/api/networks/net-in-flight/speedtest")
        assert first.status_code == 202

        second = await auth_client.post("/api/networks/net-in-flight/speedtest")

        assert second.status_code == 409
        body = second.json()
        assert body["type"] == "speedtest_in_progress"
        assert body["detail"] == "A speed test was started less than 90 seconds ago."
        authenticated_client.run_speed_test.assert_called_once()

    async def test_different_network_is_not_blocked(
        self, auth_client, authenticated_client
    ):
        """The in-flight guard is keyed by network_id - a different network
        is unaffected by a recent test on another network."""
        authenticated_client.run_speed_test = AsyncMock(
            return_value=make_raw_response(None, code=202)
        )

        first = await auth_client.post("/api/networks/net-guard-a/speedtest")
        second = await auth_client.post("/api/networks/net-guard-b/speedtest")

        assert first.status_code == 202
        assert second.status_code == 202

    async def test_guard_expires_after_the_window(
        self, auth_client, authenticated_client
    ):
        """Once the 90s window has elapsed, a new speed test is allowed."""
        from datetime import UTC, datetime, timedelta

        from app.routes import networks as networks_route

        authenticated_client.run_speed_test = AsyncMock(
            return_value=make_raw_response(None, code=202)
        )

        network_id = "net-guard-expiry"
        # Simulate a start time well outside the 90s window, without
        # sleeping in the test.
        networks_route._last_speed_test_started[network_id] = datetime.now(
            UTC
        ) - timedelta(seconds=91)

        response = await auth_client.post(f"/api/networks/{network_id}/speedtest")

        assert response.status_code == 202
        # The point of this test is that the SDK is actually reached once
        # the window has elapsed, not merely that the response isn't a 409.
        authenticated_client.run_speed_test.assert_called_once()


class TestNetworkRenameValidation:
    """networks.py:603-608 (approx) - static rejection before the read.

    ``PUT /networks/{id}/name`` is gated behind ``_NETWORK_NAME_GATE``
    (security review, 2026-09-24, § 11 decision 5) - every test below
    depends on ``experimental_writes_enabled``.
    """

    async def test_oversized_name_rejected_without_reading_network(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """A name whose UTF-8 encoding exceeds 32 bytes is rejected with a
        static 422, before get_network is ever called."""
        authenticated_client.get_network = AsyncMock()
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "x" * 33}
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Network name is invalid."
        authenticated_client.get_network.assert_not_called()
        authenticated_client.set_network_name.assert_not_called()

    async def test_control_character_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """A name containing a control character (Cc) is rejected."""
        authenticated_client.get_network = AsyncMock()
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home\x00Network"}
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Network name is invalid."
        authenticated_client.get_network.assert_not_called()

    async def test_format_character_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """A name containing a format character (Cf, e.g. zero-width joiner)
        is rejected."""
        authenticated_client.get_network = AsyncMock()
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home‍Network"}
        )

        assert response.status_code == 422
        authenticated_client.get_network.assert_not_called()

    async def test_valid_short_name_still_works(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """A normal, safe name is unaffected by the new checks."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({**sample_network, "name": "Old Name"})
        )
        authenticated_client.set_network_name = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "New Name"}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True


class TestDeviceNicknameValidation:
    """devices.py:365-375 (approx) - static rejection of unsafe nicknames."""

    async def test_control_character_rejected(self, auth_client, authenticated_client):
        """A nickname containing a control character is rejected with a
        static 422, before the SDK is called."""
        authenticated_client.set_device_nickname = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/nickname", json={"nickname": "Kids\x07Tablet"}
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Nickname is invalid."
        authenticated_client.set_device_nickname.assert_not_called()

    async def test_format_character_rejected(self, auth_client, authenticated_client):
        """A nickname containing a format character (Cf) is rejected."""
        authenticated_client.set_device_nickname = AsyncMock()

        response = await auth_client.put(
            "/api/devices/device-1/nickname",
            json={"nickname": "Kids\u202eTablet"},
        )

        assert response.status_code == 422
        authenticated_client.set_device_nickname.assert_not_called()

    async def test_safe_nickname_still_works(self, auth_client, authenticated_client):
        """A normal nickname is unaffected by the new check."""
        authenticated_client.set_device_nickname = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/devices/device-1/nickname", json={"nickname": "Kids Tablet"}
        )

        assert response.status_code == 200
        assert response.json()["success"] is True


class TestSdkGetRetriesClamp:
    """config.py:103-107 (approx) - sdk_get_retries is clamped to [0, 3]."""

    @pytest.mark.parametrize(
        ("raw_value", "expected"),
        [
            ("0", 0),
            ("1", 1),
            ("3", 3),
            ("4", 3),
            ("100", 3),
            ("-5", 0),
        ],
    )
    def test_clamped_to_0_3(self, monkeypatch, raw_value, expected):
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_SDK_GET_RETRIES", raw_value)

        settings = get_settings()

        assert settings.sdk_get_retries == expected
