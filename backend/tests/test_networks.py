"""Tests for network routes."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from eero.exceptions import EeroException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


sample_network = {
    "url": "/2.2/networks/net-1",
    "name": "Home",
    "status": "online",
    "guest_network_enabled": False,
}


class TestListNetworks:
    """Tests for GET /api/networks."""

    async def test_list_networks_success(self, auth_client, authenticated_client):
        """Returns list of networks."""
        authenticated_client.get_networks = AsyncMock(
            return_value=make_raw_response([sample_network])
        )

        response = await auth_client.get("/api/networks")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == "Home"


class TestGetNetwork:
    """Tests for GET /api/networks/{network_id}."""

    async def test_get_network_success(self, auth_client, authenticated_client):
        """Returns network details."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(sample_network)
        )
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Home"
        assert data["status"] == "online"

    async def test_get_network_guest_network_enabled(
        self, auth_client, authenticated_client
    ):
        """Reports the guest network as enabled from the nested object.

        Regression test for issue #194: the Eero Cloud API returns guest
        network status as a nested ``guest_network`` object, not a flat
        ``guest_network_enabled`` boolean.
        """
        network = {
            "url": "/2.2/networks/net-1",
            "name": "Home",
            "status": "online",
            "guest_network": {"enabled": True, "name": "Guest WiFi"},
        }
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(network)
        )
        authenticated_client.get_devices = AsyncMock(return_value=make_raw_response([]))
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        response = await auth_client.get("/api/networks/net-1")

        assert response.status_code == 200
        assert response.json()["guest_network_enabled"] is True


class TestRenameNetwork:
    """Tests for PUT /api/networks/{network_id}/name.

    ``set_network_name`` is gated behind ``_NETWORK_NAME_GATE``
    (security review, 2026-09-24, § 11 decision 5) - every test below
    depends on ``experimental_writes_enabled`` except the disabled-by-
    default check.
    """

    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_network_name.assert_not_called()

    async def test_rename_network_success(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Renames a network and returns success response."""
        authenticated_client.set_network_name = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["network_id"] == "net-1"
        assert data["name"] == "Home"
        authenticated_client.set_network_name.assert_called_once()

    async def test_rename_network_empty_name(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Empty name returns 400 without calling SDK."""
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "   "}
        )

        assert response.status_code == 400
        authenticated_client.set_network_name.assert_not_called()

    async def test_rename_network_eero_exception(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """EeroException returns 500."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({**sample_network, "name": "Old Name"})
        )
        authenticated_client.set_network_name = AsyncMock(
            side_effect=EeroException("rename failed")
        )

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "Home"}
        )

        assert response.status_code == 500

    async def test_rename_network_noop_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Renaming to the currently-stored name is a no-op (§ 5, decision 5):
        settings-class writes reboot the mesh, so an unchanged name must
        never trigger a write."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({**sample_network, "name": "Home"})
        )
        authenticated_client.set_network_name = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/name", json={"name": "  Home  "}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["changed"] is False
        authenticated_client.set_network_name.assert_not_called()

    async def test_rename_network_writes_when_changed(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """A genuinely different name triggers the write, keyword network_id=."""
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
        data = response.json()
        assert data["changed"] is True
        authenticated_client.set_network_name.assert_called_once_with(
            "New Name", network_id="net-1"
        )


class TestToggleGuestNetwork:
    """Tests for PUT /api/networks/{network_id}/guest-network."""

    async def test_toggle_guest_network_enable_with_name(
        self, auth_client, authenticated_client
    ):
        """Enables guest network with a name and returns success."""
        authenticated_client.set_guest_network = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/guest-network",
            params={"enabled": "true", "name": "Guest"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["guest_network_enabled"] is True


class TestSetPreferredNetwork:
    """Tests for POST /api/networks/{network_id}/set-preferred."""

    async def test_set_preferred_network_success(
        self, auth_client, authenticated_client
    ):
        """Sets the preferred network."""
        # set_preferred_network is synchronous on the real SDK (in-memory
        # assignment only) - not an AsyncMock.
        authenticated_client.set_preferred_network = MagicMock()

        response = await auth_client.post("/api/networks/net-1/set-preferred")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["preferred_network_id"] == "net-1"

    async def test_set_preferred_network_eero_exception(
        self, auth_client, authenticated_client
    ):
        """EeroException from set_preferred_network returns 500."""
        authenticated_client.set_preferred_network = MagicMock(
            side_effect=EeroException("boom")
        )

        response = await auth_client.post("/api/networks/net-1/set-preferred")

        assert response.status_code == 500


class TestRunSpeedTest:
    """Tests for POST /api/networks/{network_id}/speedtest.

    Fire-and-forget (phase-6.0-revamp.md § 9, decision 4, contract
    confirmed 2026-09-24): the route starts the test and returns
    immediately; it never blocks and never reads back a result. The
    frontend polls ``GET .../speedtests`` separately.
    """

    # ``_last_speed_test_started`` and the shared slowapi ``Limiter`` are
    # reset before/after every test session-wide by conftest.py's
    # ``_reset_rate_limiter``/``_reset_networks_module_state`` autouse
    # fixtures -- no per-class reset needed here.

    async def test_speed_test_returns_202_started_immediately(
        self, auth_client, authenticated_client
    ):
        """POST kicks off the test and returns 202 {status, started_at} with
        no read-back call at all."""
        authenticated_client.run_speed_test = AsyncMock(
            return_value=make_raw_response(None, code=202)
        )
        authenticated_client.get_speed_tests = AsyncMock()

        response = await auth_client.post("/api/networks/net-1/speedtest")

        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "started"
        assert "started_at" in data
        # started_at must be a real, parseable ISO-8601 timestamp
        datetime.fromisoformat(data["started_at"])
        authenticated_client.run_speed_test.assert_called_once_with(network_id="net-1")
        authenticated_client.get_speed_tests.assert_not_called()

    async def test_speed_test_eero_exception_maps_to_500(
        self, auth_client, authenticated_client
    ):
        """An EeroException from the kickoff call itself still maps to 500."""
        authenticated_client.run_speed_test = AsyncMock(
            side_effect=EeroException("speed test failed")
        )

        response = await auth_client.post("/api/networks/net-1/speedtest")

        assert response.status_code == 500


class TestGetSpeedTestHistory:
    """Tests for GET /api/networks/{network_id}/speedtests."""

    async def test_returns_normalised_history(self, auth_client, authenticated_client):
        """Returns a list of normalised SpeedTestResult entries."""
        authenticated_client.get_speed_tests = AsyncMock(
            return_value=make_raw_response(
                [
                    {
                        "down": {"value": 250.5},
                        "up": {"value": 20.1},
                        "latency": 12.3,
                        "date": "2026-01-01T00:00:00Z",
                    },
                    {"down": {"value": 100.0}, "up": {"value": 10.0}},
                ]
            )
        )

        response = await auth_client.get("/api/networks/net-1/speedtests")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["download_mbps"] == 250.5
        assert data[0]["latency_ms"] == 12.3
        authenticated_client.get_speed_tests.assert_called_once_with(
            network_id="net-1", limit=10, start_time=None, end_time=None
        )

    async def test_limit_is_bounded(self, auth_client, authenticated_client):
        """limit is capped at 50 by the query parameter validation."""
        response = await auth_client.get(
            "/api/networks/net-1/speedtests", params={"limit": 100}
        )

        assert response.status_code == 422

    async def test_limit_51_is_rejected(self, auth_client, authenticated_client):
        """One past the upper bound (50) is rejected with 422."""
        response = await auth_client.get(
            "/api/networks/net-1/speedtests", params={"limit": 51}
        )

        assert response.status_code == 422

    async def test_limit_0_is_rejected(self, auth_client, authenticated_client):
        """Zero is below the lower bound (1) and is rejected with 422."""
        response = await auth_client.get(
            "/api/networks/net-1/speedtests", params={"limit": 0}
        )

        assert response.status_code == 422

    async def test_start_end_time_forwarded_to_sdk(
        self, auth_client, authenticated_client
    ):
        """start_time/end_time query params are forwarded to get_speed_tests by keyword."""
        authenticated_client.get_speed_tests = AsyncMock(
            return_value=make_raw_response([])
        )

        response = await auth_client.get(
            "/api/networks/net-1/speedtests",
            params={
                "start_time": "2026-01-01T00:00:00Z",
                "end_time": "2026-01-02T00:00:00Z",
            },
        )

        assert response.status_code == 200
        authenticated_client.get_speed_tests.assert_called_once_with(
            network_id="net-1",
            limit=10,
            start_time="2026-01-01T00:00:00Z",
            end_time="2026-01-02T00:00:00Z",
        )

    async def test_invalid_start_time_rejected(self, auth_client, authenticated_client):
        """A malformed start_time is rejected with 400 before any SDK call."""
        response = await auth_client.get(
            "/api/networks/net-1/speedtests", params={"start_time": "not-a-date"}
        )

        assert response.status_code == 400
        authenticated_client.get_speed_tests.assert_not_called()

    async def test_default_limit_is_ten(self, auth_client, authenticated_client):
        """With no limit param at all, the SDK is called with limit=10."""
        authenticated_client.get_speed_tests = AsyncMock(
            return_value=make_raw_response([])
        )

        response = await auth_client.get("/api/networks/net-1/speedtests")

        assert response.status_code == 200
        authenticated_client.get_speed_tests.assert_called_once_with(
            network_id="net-1", limit=10, start_time=None, end_time=None
        )
