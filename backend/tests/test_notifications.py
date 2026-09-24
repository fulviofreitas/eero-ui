"""Tests for notifications reads (WP6 deliverable 13)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestNotificationSettings:
    """Tests for GET /api/networks/{network_id}/notifications."""

    async def test_returns_settings_and_unread_flag(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_notification_settings = AsyncMock(
            return_value=make_raw_response(
                {"device_connected": True, "new_device": False}
            )
        )
        authenticated_client.has_unread_notifications = AsyncMock(
            return_value=make_raw_response({"has_unread": True})
        )

        response = await auth_client.get("/api/networks/net-1/notifications")

        assert response.status_code == 200
        data = response.json()
        assert data["settings"] == {"device_connected": True, "new_device": False}
        assert data["has_unread"] is True

    async def test_each_source_fails_soft(self, auth_client, authenticated_client):
        authenticated_client.get_notification_settings = AsyncMock(
            side_effect=EeroException("boom")
        )
        authenticated_client.has_unread_notifications = AsyncMock(
            side_effect=EeroException("boom")
        )

        response = await auth_client.get("/api/networks/net-1/notifications")

        assert response.status_code == 200
        assert response.json() == {"settings": {}, "has_unread": None}


class TestNotificationHistory:
    """Tests for GET /api/networks/{network_id}/notifications/history."""

    async def test_returns_history(self, auth_client, authenticated_client):
        authenticated_client.get_notification_history = AsyncMock(
            return_value=make_raw_response({"history": [{"message": "hi"}]})
        )

        response = await auth_client.get(
            "/api/networks/net-1/notifications/history",
            params={"timestamp": "2026-07-01T00:00:00Z"},
        )

        assert response.status_code == 200
        assert response.json() == {"history": [{"message": "hi"}]}
        authenticated_client.get_notification_history.assert_called_once_with(
            network_id="net-1", timestamp="2026-07-01T00:00:00Z"
        )

    async def test_invalid_timestamp_rejected(self, auth_client, authenticated_client):
        response = await auth_client.get(
            "/api/networks/net-1/notifications/history",
            params={"timestamp": "not-a-date"},
        )

        assert response.status_code == 400
        authenticated_client.get_notification_history.assert_not_called()
