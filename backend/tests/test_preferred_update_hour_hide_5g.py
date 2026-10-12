"""Tests for the eero-api 8.3.0 writes: preferred update hour and hide 5 GHz.

PUT /api/networks/{network_id}/updates/preferred-hour  {hour}
PUT /api/networks/{network_id}/hide-5g                 {enabled}
GET /api/networks/{network_id}/advanced                (hide_5g read-back)
"""

from unittest.mock import AsyncMock

import pytest


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


PREFERRED_HOUR_URL = "/api/networks/network-123/updates/preferred-hour"
HIDE_5G_URL = "/api/networks/network-123/hide-5g"


class TestPreferredUpdateHour:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_preferred_update_hour = AsyncMock()

        response = await auth_client.put(PREFERRED_HOUR_URL, json={"hour": 3})

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_preferred_update_hour.assert_not_called()

    async def test_changes_when_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"preferred_update_hour": 2})
        )
        authenticated_client.set_preferred_update_hour = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(PREFERRED_HOUR_URL, json={"hour": 4})

        assert response.status_code == 200
        assert response.json() == {
            "success": True,
            "changed": True,
            "reboot_expected": False,
            "hour": 4,
        }
        authenticated_client.set_preferred_update_hour.assert_called_once_with(
            4, network_id="network-123"
        )

    @pytest.mark.parametrize("current", [4, "4"])
    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled, current
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"preferred_update_hour": current})
        )
        authenticated_client.set_preferred_update_hour = AsyncMock()

        response = await auth_client.put(PREFERRED_HOUR_URL, json={"hour": 4})

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.set_preferred_update_hour.assert_not_called()

    @pytest.mark.parametrize("current", [None, True, 24, "soon"])
    async def test_writes_when_current_value_unreadable(
        self, auth_client, authenticated_client, experimental_writes_enabled, current
    ):
        authenticated_client.get_updates = AsyncMock(
            return_value=make_raw_response({"preferred_update_hour": current})
        )
        authenticated_client.set_preferred_update_hour = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(PREFERRED_HOUR_URL, json={"hour": 1})

        assert response.json()["changed"] is True
        authenticated_client.set_preferred_update_hour.assert_called_once()

    @pytest.mark.parametrize("hour", [-1, 24, "3am", None])
    async def test_invalid_hour_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled, hour
    ):
        authenticated_client.set_preferred_update_hour = AsyncMock()

        response = await auth_client.put(PREFERRED_HOUR_URL, json={"hour": hour})

        assert response.status_code == 422
        authenticated_client.set_preferred_update_hour.assert_not_called()


class TestHide5g:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_hide_5g = AsyncMock()

        response = await auth_client.put(HIDE_5G_URL, json={"enabled": True})

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_hide_5g.assert_not_called()

    async def test_hides_when_flag_absent(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"temporary_flags": {}})
        )
        authenticated_client.set_hide_5g = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(HIDE_5G_URL, json={"enabled": True})

        assert response.status_code == 200
        assert response.json() == {
            "success": True,
            "changed": True,
            "reboot_expected": False,
            "disconnects_clients": True,
            "enabled": True,
        }
        authenticated_client.get_network.assert_called_once_with(
            "network-123", refresh_cache=True
        )
        authenticated_client.set_hide_5g.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_no_op_when_already_hidden(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(
                {"temporary_flags": {"hide_5g": {"value": True}}}
            )
        )
        authenticated_client.set_hide_5g = AsyncMock()

        response = await auth_client.put(HIDE_5G_URL, json={"enabled": True})

        assert response.json()["changed"] is False
        authenticated_client.set_hide_5g.assert_not_called()

    async def test_no_op_when_unhiding_an_absent_flag(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"temporary_flags": {}})
        )
        authenticated_client.set_hide_5g = AsyncMock()

        response = await auth_client.put(HIDE_5G_URL, json={"enabled": False})

        assert response.json()["changed"] is False
        authenticated_client.set_hide_5g.assert_not_called()

    async def test_writes_when_flags_missing(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """No ``temporary_flags`` object at all is unknown, not "visible"."""
        authenticated_client.get_network = AsyncMock(return_value=make_raw_response({}))
        authenticated_client.set_hide_5g = AsyncMock(return_value=make_raw_response({}))

        response = await auth_client.put(HIDE_5G_URL, json={"enabled": False})

        assert response.json()["changed"] is True
        authenticated_client.set_hide_5g.assert_called_once_with(
            False, network_id="network-123"
        )

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_hide_5g = AsyncMock()

        response = await auth_client.put(HIDE_5G_URL, json={"enabled": "nope"})

        assert response.status_code == 422
        authenticated_client.set_hide_5g.assert_not_called()


class TestAdvancedHide5gReadBack:
    @pytest.mark.parametrize(
        ("envelope", "hidden", "expiration"),
        [
            ({"temporary_flags": {}}, False, None),
            (
                {
                    "temporary_flags": {
                        "hide_5g": {
                            "value": True,
                            "expiration": "2026-10-12T05:00:00Z",
                        }
                    }
                },
                True,
                "2026-10-12T05:00:00Z",
            ),
            ({}, None, None),
        ],
    )
    async def test_reports_flag(
        self, auth_client, authenticated_client, envelope, hidden, expiration
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(envelope)
        )

        response = await auth_client.get("/api/networks/network-123/advanced")

        assert response.status_code == 200
        data = response.json()
        assert data["hide_5g"] is hidden
        assert data["hide_5g_expiration"] == expiration
