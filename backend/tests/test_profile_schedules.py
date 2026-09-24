"""Tests for profile schedules (phase-6.0-revamp.md WP7, family 1)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


def make_schedule(schedule_id="sched-1", **overrides):
    base = {
        "url": f"/2.2/networks/network-123/profiles/profile-1/schedules/{schedule_id}",
        "name": "Bedtime",
        "days": ["monday", "tuesday"],
        "start": "21:00",
        "end": "07:00",
        "enabled": True,
    }
    base.update(overrides)
    return base


class TestListProfileSchedules:
    async def test_returns_schedules_not_gated(self, auth_client, authenticated_client):
        """Reads are not behind the experimental-writes gate."""
        authenticated_client.get_schedules = AsyncMock(
            return_value=make_raw_response([make_schedule()])
        )

        response = await auth_client.get("/api/profiles/profile-1/schedules")

        assert response.status_code == 200
        data = response.json()
        assert data[0]["id"] == "sched-1"
        assert data[0]["days"] == ["monday", "tuesday"]


class TestCreateProfileSchedule:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.create_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/profiles/profile-1/schedules",
            json={
                "name": "Bedtime",
                "days": ["monday"],
                "start": "21:00",
                "end": "07:00",
            },
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.create_schedule.assert_not_called()

    async def test_valid_request_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_schedule = AsyncMock(
            return_value=make_raw_response(make_schedule())
        )

        response = await auth_client.post(
            "/api/profiles/profile-1/schedules",
            json={
                "name": "Bedtime",
                "days": ["monday", "tuesday"],
                "start": "21:00",
                "end": "07:00",
            },
        )

        assert response.status_code == 201
        authenticated_client.create_schedule.assert_called_once_with(
            "profile-1",
            name="Bedtime",
            days=["monday", "tuesday"],
            start="21:00",
            end="07:00",
            enabled=True,
            network_id="network-123",
        )

    async def test_invalid_day_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/profiles/profile-1/schedules",
            json={
                "name": "Bedtime",
                "days": ["mon"],
                "start": "21:00",
                "end": "07:00",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_schedule.assert_not_called()

    async def test_invalid_time_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_schedule = AsyncMock()

        response = await auth_client.post(
            "/api/profiles/profile-1/schedules",
            json={
                "name": "Bedtime",
                "days": ["monday"],
                "start": "9pm",
                "end": "07:00",
            },
        )

        assert response.status_code == 422
        authenticated_client.create_schedule.assert_not_called()

    async def test_empty_name_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        response = await auth_client.post(
            "/api/profiles/profile-1/schedules",
            json={"name": "  ", "days": ["monday"], "start": "21:00", "end": "07:00"},
        )

        assert response.status_code == 422


class TestUpdateProfileSchedule:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.update_schedule = AsyncMock()

        response = await auth_client.put(
            "/api/profiles/profile-1/schedules/sched-1", json={"name": "New name"}
        )

        assert response.status_code == 403
        authenticated_client.update_schedule.assert_not_called()

    async def test_updates_matched_schedule(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_schedules = AsyncMock(
            return_value=make_raw_response([make_schedule()])
        )
        authenticated_client.update_schedule = AsyncMock(
            return_value=make_raw_response(make_schedule(name="Renamed"))
        )

        response = await auth_client.put(
            "/api/profiles/profile-1/schedules/sched-1", json={"name": "Renamed"}
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"
        call_args = authenticated_client.update_schedule.call_args
        assert call_args.args[0]["url"].endswith("/sched-1")
        assert call_args.kwargs["name"] == "Renamed"

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_schedules = AsyncMock(
            return_value=make_raw_response([make_schedule()])
        )
        authenticated_client.update_schedule = AsyncMock()

        response = await auth_client.put(
            "/api/profiles/profile-1/schedules/sched-1",
            json={"days": ["monday", "tuesday"]},
        )

        assert response.status_code == 200
        authenticated_client.update_schedule.assert_not_called()

    async def test_unknown_schedule_id_returns_404(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_schedules = AsyncMock(
            return_value=make_raw_response([make_schedule()])
        )

        response = await auth_client.put(
            "/api/profiles/profile-1/schedules/does-not-exist",
            json={"name": "Renamed"},
        )

        assert response.status_code == 404


class TestDeleteProfileSchedule:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_schedule = AsyncMock()

        response = await auth_client.delete("/api/profiles/profile-1/schedules/sched-1")

        assert response.status_code == 403
        authenticated_client.delete_schedule.assert_not_called()

    async def test_deletes_matched_schedule(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_schedules = AsyncMock(
            return_value=make_raw_response([make_schedule()])
        )
        authenticated_client.delete_schedule = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete("/api/profiles/profile-1/schedules/sched-1")

        assert response.status_code == 200
        assert response.json()["success"] is True
        authenticated_client.delete_schedule.assert_called_once()


class TestClearProfileSchedules:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.clear_profile_schedule = AsyncMock()

        response = await auth_client.delete("/api/profiles/profile-1/schedules")

        assert response.status_code == 403
        authenticated_client.clear_profile_schedule.assert_not_called()

    async def test_clears_all_schedules(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.clear_profile_schedule = AsyncMock(
            return_value=[make_raw_response({}), make_raw_response({})]
        )

        response = await auth_client.delete("/api/profiles/profile-1/schedules")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_count"] == 2


class TestCreateProfileBedtime:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.enable_bedtime = AsyncMock()

        response = await auth_client.post(
            "/api/profiles/profile-1/bedtime",
            json={"start_time": "21:00", "end_time": "07:00"},
        )

        assert response.status_code == 403
        authenticated_client.enable_bedtime.assert_not_called()

    async def test_valid_bedtime_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.enable_bedtime = AsyncMock(
            return_value=make_raw_response(make_schedule(name="Bedtime"))
        )

        response = await auth_client.post(
            "/api/profiles/profile-1/bedtime",
            json={"start_time": "21:00", "end_time": "07:00"},
        )

        assert response.status_code == 201
        authenticated_client.enable_bedtime.assert_called_once_with(
            "profile-1", "21:00", "07:00", None, network_id="network-123"
        )
