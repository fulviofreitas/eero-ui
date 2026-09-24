"""Tests for WP8 family 3: WPA3 per band, envelope security, MLO.

PUT /api/networks/{network_id}/wpa3        {band_2_4_ghz?, band_5_ghz?}
PUT /api/networks/{network_id}/security    {wpa3?|band_steering?|upnp?|ipv6?}
PUT /api/networks/{network_id}/mlo         {mode}
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateWpa3PerBand:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_wpa3_per_band = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/wpa3", json={"band_2_4_ghz": "WPA3"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_wpa3_per_band.assert_not_called()

    async def test_changes_band_and_reads_back(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_wpa3_per_band = AsyncMock(
            side_effect=[
                make_raw_response({"band_2_4_ghz": "WPA2", "band_5_ghz": "WPA2_WPA3"}),
                make_raw_response({"band_2_4_ghz": "WPA3", "band_5_ghz": "WPA2_WPA3"}),
            ]
        )
        authenticated_client.set_wpa3_per_band = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/wpa3", json={"band_2_4_ghz": "WPA3"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        assert data["band_2_4_ghz"] == "WPA3"
        authenticated_client.set_wpa3_per_band.assert_called_once_with(
            "network-123", band_2_4_ghz="WPA3", band_5_ghz=None
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_wpa3_per_band = AsyncMock(
            return_value=make_raw_response(
                {"band_2_4_ghz": "WPA3", "band_5_ghz": "WPA3"}
            )
        )
        authenticated_client.set_wpa3_per_band = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/wpa3", json={"band_2_4_ghz": "WPA3"}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_wpa3_per_band.assert_not_called()

    async def test_empty_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_wpa3_per_band = AsyncMock()

        response = await auth_client.put("/api/networks/network-123/wpa3", json={})

        assert response.status_code == 422
        authenticated_client.set_wpa3_per_band.assert_not_called()

    async def test_invalid_mode_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_wpa3_per_band = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/wpa3", json={"band_2_4_ghz": "OPEN"}
        )

        assert response.status_code == 422
        authenticated_client.set_wpa3_per_band.assert_not_called()

    async def test_no_6ghz_param_ignored(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """No `band_6_ghz` parameter exists in eero-api v8.0.3; extras are ignored."""
        authenticated_client.get_wpa3_per_band = AsyncMock(
            return_value=make_raw_response(
                {"band_2_4_ghz": "WPA3", "band_5_ghz": "WPA3"}
            )
        )
        authenticated_client.set_wpa3_per_band = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/wpa3",
            json={"band_2_4_ghz": "WPA3", "band_6_ghz": "WPA3"},
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False


class TestUpdateSecurity:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_upnp = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/security", json={"upnp": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_upnp.assert_not_called()

    async def test_exactly_one_field_required_rejects_zero(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        response = await auth_client.put("/api/networks/network-123/security", json={})

        assert response.status_code == 422

    async def test_exactly_one_field_required_rejects_two(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        response = await auth_client.put(
            "/api/networks/network-123/security",
            json={"upnp": True, "wpa3": True},
        )

        assert response.status_code == 422

    async def test_changes_upnp_when_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"upnp": False})
        )
        authenticated_client.set_upnp = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/security", json={"upnp": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["field"] == "upnp"
        assert data["value"] is True
        authenticated_client.set_upnp.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"band_steering": True})
        )
        authenticated_client.set_band_steering = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/security", json={"band_steering": True}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_band_steering.assert_not_called()

    async def test_ipv6_maps_to_ipv6_upstream_field(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"ipv6_upstream": False})
        )
        authenticated_client.set_ipv6 = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/security", json={"ipv6": True}
        )

        assert response.json()["changed"] is True
        authenticated_client.set_ipv6.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_writes_when_current_value_unparseable(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S7): an unparseable current value is
        unknown, not False - requesting ``upnp=False`` must still write."""
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"upnp": "not-a-bool-token"})
        )
        authenticated_client.set_upnp = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(
            "/api/networks/network-123/security", json={"upnp": False}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        authenticated_client.set_upnp.assert_called_once_with(
            False, network_id="network-123"
        )


class TestUpdateMloMode:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_mlo_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/mlo", json={"mode": "single"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_mlo_mode.assert_not_called()

    async def test_changes_mode_when_known_and_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"mlo_mode": "disabled"})
        )
        authenticated_client.set_mlo_mode = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/mlo", json={"mode": "multi"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["mode"] == "multi"
        authenticated_client.set_mlo_mode.assert_called_once_with(
            "multi", network_id="network-123"
        )

    async def test_no_op_when_known_and_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"mlo_mode": "single"})
        )
        authenticated_client.set_mlo_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/mlo", json={"mode": "single"}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_mlo_mode.assert_not_called()

    async def test_writes_when_no_op_guard_unavailable(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """No documented `mlo_mode` pass-through key: guard skipped, write proceeds."""
        authenticated_client.get_network = AsyncMock(return_value=make_raw_response({}))
        authenticated_client.set_mlo_mode = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/mlo", json={"mode": "multi"}
        )

        assert response.json()["changed"] is True
        authenticated_client.set_mlo_mode.assert_called_once()

    async def test_invalid_mode_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_mlo_mode = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/mlo", json={"mode": "everywhere"}
        )

        assert response.status_code == 422
        authenticated_client.set_mlo_mode.assert_not_called()
