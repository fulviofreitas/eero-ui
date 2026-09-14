"""Tests for network DNS routes.

DNS is the highest-blast-radius write in this API: a single PUT reboots
every eero on the network. The no-op guard (comparing current vs requested
state before deciding to write at all) is therefore the single most
important behaviour under test here - especially the IPv6 case, since the
API stores IPv6 addresses fully expanded and a naive string comparison
would falsely report a change on every read-modify-write cycle.
"""

from unittest.mock import AsyncMock

from eero.exceptions import EeroValidationException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


def make_network_dns(
    ipv4_mode="automatic",
    ipv4_servers=None,
    ipv6_mode="automatic",
    ipv6_servers=None,
    caching=False,
    parent_ips=None,
    providers=None,
):
    """Build a raw network dict with the dns/ipv6 sub-objects populated."""
    return {
        "url": "/2.2/networks/net-1",
        "name": "Home",
        "dns": {
            "mode": ipv4_mode,
            "custom": {"ips": ipv4_servers or []},
            "parent": {"ips": parent_ips or ["8.8.8.8"]},
            "caching": caching,
            "default_test_servers": providers
            or [
                {
                    "name": "Cloudflare",
                    "ipv4": ["1.1.1.1", "1.0.0.1"],
                    "ipv6": ["2606:4700:4700::1111", "2606:4700:4700::1001"],
                }
            ],
        },
        "ipv6": {
            "name_servers": {
                "mode": ipv6_mode,
                "custom": ipv6_servers or [],
            }
        },
    }


class TestGetDns:
    """Tests for GET /api/networks/{network_id}/dns."""

    async def test_get_dns_returns_normalized_contract(
        self, auth_client, authenticated_client
    ):
        """Returns the normalized DNS contract shape."""
        raw_network = make_network_dns(
            ipv4_mode="custom",
            ipv4_servers=["1.1.1.1", "1.0.0.1"],
            ipv6_mode="custom",
            ipv6_servers=["2606:4700:4700:0:0:0:0:1111"],
            caching=True,
        )
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )

        response = await auth_client.get("/api/networks/net-1/dns")

        assert response.status_code == 200
        data = response.json()
        assert data["ipv4"] == {"mode": "custom", "servers": ["1.1.1.1", "1.0.0.1"]}
        # Fully-expanded IPv6 from the API is compressed on read.
        assert data["ipv6"] == {"mode": "custom", "servers": ["2606:4700:4700::1111"]}
        assert data["caching"] is True
        assert data["parent_ips"] == ["8.8.8.8"]
        assert data["providers"][0]["name"] == "Cloudflare"

    async def test_get_dns_tolerates_missing_dns_and_ipv6(
        self, auth_client, authenticated_client
    ):
        """Tolerates a network payload with dns=None and ipv6 missing entirely."""
        raw_network = {"url": "/2.2/networks/net-1", "name": "Home", "dns": None}
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )

        response = await auth_client.get("/api/networks/net-1/dns")

        assert response.status_code == 200
        data = response.json()
        assert data["ipv4"] == {"mode": "automatic", "servers": []}
        assert data["ipv6"] == {"mode": "automatic", "servers": []}
        assert data["caching"] is False
        assert data["parent_ips"] == []
        assert data["providers"] == []

    async def test_get_dns_unauthenticated(self, async_client):
        """Unauthenticated request returns 401."""
        response = await async_client.get("/api/networks/net-1/dns")

        assert response.status_code == 401


class TestUpdateDns:
    """Tests for PUT /api/networks/{network_id}/dns."""

    async def test_noop_guard_returns_changed_false_without_writing(
        self, auth_client, authenticated_client
    ):
        """Requesting the currently-active state is a no-op - no write occurs."""
        raw_network = make_network_dns(
            ipv4_mode="custom", ipv4_servers=["1.1.1.1", "1.0.0.1"]
        )
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock()
        authenticated_client.set_custom_dns = AsyncMock()
        authenticated_client.clear_custom_dns = AsyncMock()
        authenticated_client.set_dns_mode = AsyncMock()
        authenticated_client.set_dns_caching = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": ["1.1.1.1", "1.0.0.1"]}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["changed"] is False
        assert data["dns"]["ipv4"]["servers"] == ["1.1.1.1", "1.0.0.1"]

        authenticated_client.set_custom_dns_ipv4.assert_not_called()
        authenticated_client.set_custom_dns.assert_not_called()
        authenticated_client.clear_custom_dns.assert_not_called()
        authenticated_client.set_dns_mode.assert_not_called()
        authenticated_client.set_dns_caching.assert_not_called()

    async def test_noop_guard_not_fooled_by_ipv6_expanded_form(
        self, auth_client, authenticated_client
    ):
        """Headline test: expanded-vs-compressed IPv6 must not look like a change.

        The API stores "2606:4700:4700::1111" as
        "2606:4700:4700:0:0:0:0:1111". A request re-submitting the compressed
        form must be recognised as identical and must NOT trigger a write -
        a false positive here reboots the user's network for nothing.
        """
        raw_network = make_network_dns(
            ipv6_mode="custom",
            ipv6_servers=["2606:4700:4700:0:0:0:0:1111"],
        )
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_custom_dns_ipv6 = AsyncMock()
        authenticated_client.set_custom_dns = AsyncMock()
        authenticated_client.clear_custom_dns = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv6": {"mode": "custom", "servers": ["2606:4700:4700::1111"]}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is False

        authenticated_client.set_custom_dns_ipv6.assert_not_called()
        authenticated_client.set_custom_dns.assert_not_called()
        authenticated_client.clear_custom_dns.assert_not_called()

    async def test_order_swap_is_a_change(self, auth_client, authenticated_client):
        """Swapping primary/secondary server order IS a change."""
        raw_network = make_network_dns(
            ipv4_mode="custom", ipv4_servers=["1.1.1.1", "1.0.0.1"]
        )
        authenticated_client.get_dns_settings = AsyncMock(
            side_effect=[
                make_raw_response(raw_network),
                make_raw_response(
                    make_network_dns(
                        ipv4_mode="custom", ipv4_servers=["1.0.0.1", "1.1.1.1"]
                    )
                ),
            ]
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": ["1.0.0.1", "1.1.1.1"]}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        authenticated_client.set_custom_dns_ipv4.assert_called_once_with(
            ["1.0.0.1", "1.1.1.1"], network_id="net-1"
        )

    async def test_ipv4_only_request_leaves_ipv6_untouched(
        self, auth_client, authenticated_client
    ):
        """An ipv4-only request must not call any ipv6 SDK method."""
        raw_network = make_network_dns(
            ipv4_mode="custom",
            ipv4_servers=["1.1.1.1"],
            ipv6_mode="custom",
            ipv6_servers=["2606:4700:4700::1111"],
        )
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.set_custom_dns_ipv6 = AsyncMock()
        authenticated_client.set_custom_dns = AsyncMock()
        authenticated_client.clear_custom_dns = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": ["9.9.9.9"]}},
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.set_custom_dns_ipv4.assert_called_once_with(
            ["9.9.9.9"], network_id="net-1"
        )
        authenticated_client.set_custom_dns_ipv6.assert_not_called()
        authenticated_client.set_custom_dns.assert_not_called()
        authenticated_client.clear_custom_dns.assert_not_called()

    async def test_mode_automatic_dispatches_clear_with_family(
        self, auth_client, authenticated_client
    ):
        """Switching a family to automatic calls clear_custom_dns with that family."""
        raw_network = make_network_dns(
            ipv4_mode="custom", ipv4_servers=["1.1.1.1"]
        )
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.clear_custom_dns = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "automatic"}},
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.clear_custom_dns.assert_called_once_with(
            family="ipv4", network_id="net-1"
        )

    async def test_too_many_servers_rejected(self, auth_client, authenticated_client):
        """More than 2 servers in one family returns 400."""
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(make_network_dns())
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={
                "ipv4": {
                    "mode": "custom",
                    "servers": ["1.1.1.1", "1.0.0.1", "9.9.9.9"],
                }
            },
        )

        assert response.status_code == 400

    async def test_wrong_family_address_rejected(
        self, auth_client, authenticated_client
    ):
        """An IPv6 literal submitted under the ipv4 field returns 400."""
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(make_network_dns())
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={
                "ipv4": {"mode": "custom", "servers": ["2606:4700:4700::1111"]}
            },
        )

        assert response.status_code == 400

    async def test_malformed_literal_rejected(self, auth_client, authenticated_client):
        """A malformed IP literal returns 400."""
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(make_network_dns())
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": ["not-an-ip"]}},
        )

        assert response.status_code == 400

    async def test_zone_identifier_rejected(self, auth_client, authenticated_client):
        """An address with a zone identifier returns 400."""
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(make_network_dns())
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv6": {"mode": "custom", "servers": ["fe80::1%eth0"]}},
        )

        assert response.status_code == 400

    async def test_sdk_validation_exception_surfaces_as_422(
        self, auth_client, authenticated_client
    ):
        """EeroValidationException from the SDK surfaces as 422 with the field."""
        raw_network = make_network_dns(ipv4_mode="automatic")
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock(
            side_effect=EeroValidationException("dns_servers", "bad servers")
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": ["1.1.1.1"]}},
        )

        assert response.status_code == 422
        assert response.json()["detail"]["field"] == "dns_servers"

    async def test_update_dns_unauthenticated(self, async_client):
        """Unauthenticated request returns 401."""
        response = await async_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "automatic"}},
        )

        assert response.status_code == 401

    async def test_empty_request_body_rejected(self, auth_client, authenticated_client):
        """A request with no ipv4, ipv6, or caching field returns 400."""
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(make_network_dns())
        )

        response = await auth_client.put("/api/networks/net-1/dns", json={})

        assert response.status_code == 400

    async def test_both_families_custom_combined_into_single_write(
        self, auth_client, authenticated_client
    ):
        """Setting ipv4 and ipv6 to custom in one request issues one SDK call.

        Each additional PUT to the settings endpoint reboots the mesh again,
        so when both families change to the same kind of state they must be
        dispatched together via `set_custom_dns` rather than as two separate
        per-family calls.
        """
        raw_network = make_network_dns()
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_custom_dns = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock()
        authenticated_client.set_custom_dns_ipv6 = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={
                "ipv4": {"mode": "custom", "servers": ["1.1.1.1"]},
                "ipv6": {"mode": "custom", "servers": ["2606:4700:4700::1111"]},
            },
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.set_custom_dns.assert_called_once_with(
            ["1.1.1.1", "2606:4700:4700::1111"], network_id="net-1"
        )
        authenticated_client.set_custom_dns_ipv4.assert_not_called()
        authenticated_client.set_custom_dns_ipv6.assert_not_called()

    async def test_both_families_automatic_combined_into_single_write(
        self, auth_client, authenticated_client
    ):
        """Switching both families to automatic issues one clear_custom_dns call."""
        raw_network = make_network_dns(
            ipv4_mode="custom",
            ipv4_servers=["1.1.1.1"],
            ipv6_mode="custom",
            ipv6_servers=["2606:4700:4700::1111"],
        )
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.clear_custom_dns = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={
                "ipv4": {"mode": "automatic"},
                "ipv6": {"mode": "automatic"},
            },
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.clear_custom_dns.assert_called_once_with(
            family=None, network_id="net-1"
        )

    async def test_mode_only_custom_reenables_stored_servers(
        self, auth_client, authenticated_client
    ):
        """mode=custom with no servers re-enables the servers already stored.

        The API is non-destructive when a family is switched to automatic -
        it keeps the previously configured servers around. Submitting
        mode="custom" with an empty servers list should resend those stored
        servers rather than being rejected or treated as a no-op-that-fails.
        """
        raw_network = make_network_dns(ipv4_mode="automatic", ipv4_servers=["9.9.9.9"])
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": []}},
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.set_custom_dns_ipv4.assert_called_once_with(
            ["9.9.9.9"], network_id="net-1"
        )

    async def test_mode_only_custom_without_stored_servers_rejected(
        self, auth_client, authenticated_client
    ):
        """mode=custom with no servers and none stored returns 400."""
        raw_network = make_network_dns(ipv4_mode="automatic", ipv4_servers=[])
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )

        response = await auth_client.put(
            "/api/networks/net-1/dns",
            json={"ipv4": {"mode": "custom", "servers": []}},
        )

        assert response.status_code == 400

    async def test_caching_only_change_dispatches_set_dns_caching(
        self, auth_client, authenticated_client
    ):
        """A caching-only change calls set_dns_caching without touching DNS servers."""
        raw_network = make_network_dns(caching=False)
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_dns_caching = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.set_custom_dns_ipv4 = AsyncMock()
        authenticated_client.clear_custom_dns = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/dns", json={"caching": True}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is True
        authenticated_client.set_dns_caching.assert_called_once_with(
            True, network_id="net-1"
        )
        authenticated_client.set_custom_dns_ipv4.assert_not_called()
        authenticated_client.clear_custom_dns.assert_not_called()

    async def test_caching_matching_current_value_is_a_noop(
        self, auth_client, authenticated_client
    ):
        """Requesting the currently-active caching value does not write."""
        raw_network = make_network_dns(caching=True)
        authenticated_client.get_dns_settings = AsyncMock(
            return_value=make_raw_response(raw_network)
        )
        authenticated_client.set_dns_caching = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/dns", json={"caching": True}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.set_dns_caching.assert_not_called()
