"""Tests for notifications writes (phase-6.0-revamp.md WP7, family 3)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateNotificationSettings:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_notification_settings = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/notifications",
            json={"settings": {"security_alerts": False}},
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_notification_settings.assert_not_called()

    async def test_known_key_toggled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_notification_settings = AsyncMock(
            side_effect=[
                make_raw_response({"security_alerts": True, "marketing": False}),
                make_raw_response({"security_alerts": False, "marketing": False}),
            ]
        )
        authenticated_client.set_notification_settings = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/notifications",
            json={"settings": {"security_alerts": False}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["security_alerts"] is False
        authenticated_client.set_notification_settings.assert_called_once_with(
            {"security_alerts": False, "marketing": False}, network_id="net-1"
        )

    async def test_unknown_key_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_notification_settings = AsyncMock(
            return_value=make_raw_response({"security_alerts": True})
        )
        authenticated_client.set_notification_settings = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/notifications",
            json={"settings": {"not_a_real_setting": True}},
        )

        assert response.status_code == 422
        authenticated_client.set_notification_settings.assert_not_called()

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_notification_settings = AsyncMock(
            return_value=make_raw_response({"security_alerts": True})
        )
        authenticated_client.has_unread_notifications = AsyncMock(
            return_value=make_raw_response({"has_unread": False})
        )
        authenticated_client.set_notification_settings = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/notifications",
            json={"settings": {"security_alerts": True}},
        )

        assert response.status_code == 200
        authenticated_client.set_notification_settings.assert_not_called()

    async def test_empty_settings_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        response = await auth_client.put(
            "/api/networks/net-1/notifications", json={"settings": {}}
        )

        assert response.status_code == 400


class TestMarkNotificationsRead:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.mark_notifications_read = AsyncMock()

        response = await auth_client.post("/api/networks/net-1/notifications/mark-read")

        assert response.status_code == 403
        authenticated_client.mark_notifications_read.assert_not_called()

    async def test_marks_read(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.mark_notifications_read = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/networks/net-1/notifications/mark-read")

        assert response.status_code == 200
        assert response.json()["success"] is True
