"""Tests for WP8 family 8: power saving + power-saving schedules.

PUT /api/networks/{network_id}/power-saving                {enable?, schedule_enabled?}
GET/POST /api/networks/{network_id}/power-saving/schedules
PUT/DELETE /api/networks/{network_id}/power-saving/schedules/{schedule_id}

The power-saving toggle is settings-class (`_POWER_SAVING_GATE`,
2/minute `settings_writes` scope); the schedules CRUD is NOT settings-class
(`_POWER_SAVING_SCHEDULES_GATE`, 10/minute `experimental_writes` scope),
per the coordinator's spec for this family.
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdatePowerSaving:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_power_saving = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/power-saving", json={"enable": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_power_saving.assert_not_called()

    async def test_changes_when_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(
                {
                    "power_saving": {
                        "enable": False,
                        "power_saving_schedule_enabled": False,
                    }
                }
            )
        )
        authenticated_client.set_power_saving = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/power-saving", json={"enable": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        assert data["enable"] is True
        authenticated_client.set_power_saving.assert_called_once_with(
            "network-123", enable=True, power_saving_schedule_enabled=None
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response(
                {
                    "power_saving": {
                        "enable": True,
                        "power_saving_schedule_enabled": True,
                    }
                }
            )
        )
        authenticated_client.set_power_saving = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/power-saving",
            json={"enable": True, "schedule_enabled": True},
        )

        assert response.json()["changed"] is False
        authenticated_client.set_power_saving.assert_not_called()

    async def test_empty_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_power_saving = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/power-saving", json={}
        )

        assert response.status_code == 422
        authenticated_client.set_power_saving.assert_not_called()


class TestPowerSavingSchedules:
    async def test_list_is_not_gated(self, auth_client, authenticated_client):
        authenticated_client.get_power_saving_schedules = AsyncMock(
            return_value=make_raw_response({"schedules": [{"schedule_id": "s1"}]})
        )

        response = await auth_client.get(
            "/api/networks/network-123/power-saving/schedules"
        )

        assert response.status_code == 200
        assert response.json()["schedules"] == [{"schedule_id": "s1"}]

    async def test_create_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.create_power_saving_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/networks/network-123/power-saving/schedules",
            json={
                "name": "Night",
                "days": ["mon", "tue"],
                "start_time": "22:00",
                "end_time": "06:00",
            },
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.create_power_saving_schedule.assert_not_called()

    async def test_create_succeeds_when_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_power_saving_schedule = AsyncMock(
            return_value=make_raw_response({"schedule_id": "s1", "name": "Night"})
        )

        response = await auth_client.post(
            "/api/networks/network-123/power-saving/schedules",
            json={
                "name": "Night",
                "days": ["mon", "tue"],
                "start_time": "22:00",
                "end_time": "06:00",
            },
        )

        assert response.status_code == 200
        assert response.json()["success"] is True
        authenticated_client.create_power_saving_schedule.assert_called_once_with(
            "network-123",
            name="Night",
            days=["mon", "tue"],
            start_time="22:00",
            end_time="06:00",
            enabled=True,
        )

    async def test_create_invalid_day_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_power_saving_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/networks/network-123/power-saving/schedules",
            json={
                "name": "Night",
                "days": ["someday"],
                "start_time": "22:00",
                "end_time": "06:00",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_power_saving_schedule.assert_not_called()

    async def test_create_invalid_time_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_power_saving_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/networks/network-123/power-saving/schedules",
            json={
                "name": "Night",
                "days": ["mon"],
                "start_time": "25:99",
                "end_time": "06:00",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_power_saving_schedule.assert_not_called()

    async def test_create_empty_name_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_power_saving_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/networks/network-123/power-saving/schedules",
            json={
                "name": "   ",
                "days": ["mon"],
                "start_time": "22:00",
                "end_time": "06:00",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_power_saving_schedule.assert_not_called()

    async def test_update_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.update_power_saving_schedule = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/power-saving/schedules/s1",
            json={"enabled": False},
        )

        assert response.status_code == 403
        authenticated_client.update_power_saving_schedule.assert_not_called()

    async def test_update_succeeds_when_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.update_power_saving_schedule = AsyncMock(
            return_value=make_raw_response({"schedule_id": "s1", "enabled": False})
        )

        response = await auth_client.put(
            "/api/networks/network-123/power-saving/schedules/s1",
            json={"enabled": False},
        )

        assert response.status_code == 200
        authenticated_client.update_power_saving_schedule.assert_called_once_with(
            "s1",
            network_id="network-123",
            name=None,
            days=None,
            start_time=None,
            end_time=None,
            enabled=False,
        )

    async def test_update_empty_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.update_power_saving_schedule = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/power-saving/schedules/s1", json={}
        )

        assert response.status_code == 422
        authenticated_client.update_power_saving_schedule.assert_not_called()

    async def test_delete_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_power_saving_schedule = AsyncMock()

        response = await auth_client.delete(
            "/api/networks/network-123/power-saving/schedules/s1"
        )

        assert response.status_code == 403
        authenticated_client.delete_power_saving_schedule.assert_not_called()

    async def test_delete_succeeds_when_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_power_saving_schedule = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete(
            "/api/networks/network-123/power-saving/schedules/s1"
        )

        assert response.status_code == 200
        authenticated_client.delete_power_saving_schedule.assert_called_once_with(
            "s1", network_id="network-123"
        )
