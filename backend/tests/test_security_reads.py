"""Tests for security/WAN read routes (WP6 deliverable 12)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroException, EeroNotFoundException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestNetworkSecurity:
    """Tests for GET /api/networks/{network_id}/security."""

    async def test_combines_all_sources(self, auth_client, authenticated_client):
        authenticated_client.get_security_settings = AsyncMock(
            return_value=make_raw_response(
                {"wpa3": True, "band_steering": True, "upnp": False, "ipv6": {}}
            )
        )
        authenticated_client.get_wpa3_per_band = AsyncMock(
            return_value=make_raw_response({"band_5_ghz": "WPA3"})
        )
        authenticated_client.get_fast_transition = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )
        authenticated_client.get_sqm_settings = AsyncMock(
            return_value=make_raw_response({"sqm": False})
        )
        authenticated_client.get_thread = AsyncMock(
            return_value=make_raw_response({"enabled": False})
        )
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"available": False})
        )

        response = await auth_client.get("/api/networks/net-1/security")

        assert response.status_code == 200
        data = response.json()
        assert data["wpa3"] is True
        assert data["wpa3_per_band"] == {"band_5_ghz": "WPA3"}
        assert data["fast_transition"] == {"enabled": True}
        assert data["sqm"] is False
        # Allowlisted (security review, 2026-09-24): Thread key/dataset/PSKc
        # are never forwarded, even though the raw fixture didn't carry one.
        assert data["thread"] == {
            "enabled": False,
            "name": None,
            "channel": None,
            "pan_id": None,
        }
        assert data["updates"] == {"available": False}

    async def test_each_source_fails_soft(self, auth_client, authenticated_client):
        for attr in (
            "get_security_settings",
            "get_wpa3_per_band",
            "get_fast_transition",
            "get_sqm_settings",
            "get_thread",
            "get_updates",
        ):
            setattr(
                authenticated_client,
                attr,
                AsyncMock(side_effect=EeroException("boom")),
            )

        response = await auth_client.get("/api/networks/net-1/security")

        assert response.status_code == 200
        data = response.json()
        assert all(
            data[key] is None
            for key in (
                "wpa3",
                "band_steering",
                "upnp",
                "ipv6",
                "wpa3_per_band",
                "fast_transition",
                "sqm",
                "thread",
                "updates",
            )
        )


class TestSubnets:
    """Tests for GET /api/networks/{network_id}/subnets."""

    async def test_returns_subnets(self, auth_client, authenticated_client):
        authenticated_client.get_subnets_config = AsyncMock(
            return_value=make_raw_response({"subnets": [{"name": "guest"}]})
        )

        response = await auth_client.get("/api/networks/net-1/subnets")

        assert response.status_code == 200
        assert response.json() == {"subnets": [{"name": "guest"}]}


class TestMultiStaticIp:
    """Tests for GET /api/networks/{network_id}/multistaticip."""

    async def test_returns_config_when_present(self, auth_client, authenticated_client):
        authenticated_client.get_multistaticip = AsyncMock(
            return_value=make_raw_response({"enabled": True, "type": "P"})
        )

        response = await auth_client.get("/api/networks/net-1/multistaticip")

        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is True
        assert data["config"] == {"enabled": True, "type": "P"}

    async def test_404_reported_as_not_configured(
        self, auth_client, authenticated_client
    ):
        """A 404 means the feature isn't configured, not an error."""
        authenticated_client.get_multistaticip = AsyncMock(
            side_effect=EeroNotFoundException("multistaticip", "net-1")
        )

        response = await auth_client.get("/api/networks/net-1/multistaticip")

        assert response.status_code == 200
        assert response.json() == {"configured": False, "config": None}


class TestAdvancedSettings:
    """Tests for GET /api/networks/{network_id}/advanced."""

    async def test_reads_from_network_envelope(self, auth_client, authenticated_client):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(
                {
                    "url": "/2.2/networks/net-1",
                    "name": "Home",
                    "dhcp": {"mode": "custom", "custom": {"start_ip": "10.0.0.10"}},
                    "connection_mode": "bridge",
                    "power_saving": True,
                    "ddns": {"enabled": False},
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/advanced")

        assert response.status_code == 200
        data = response.json()
        assert data["connection_mode"] == "bridge"
        assert data["power_saving"] is True
        assert data["ddns"] == {"enabled": False}
        assert data["dhcp"]["starting_address"] == "10.0.0.10"
