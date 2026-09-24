"""Tests for backup-internet and backup-access-point reads (WP6 deliverable 11)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroPremiumRequiredException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestBackupInternet:
    """Tests for GET /api/networks/{network_id}/backup-internet."""

    async def test_returns_all_sources_combined(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_backup_internet = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )
        authenticated_client.get_cellular_backup_usage = AsyncMock(
            return_value=make_raw_response({"bytes_used": 1024})
        )
        authenticated_client.get_cellular_backup_events = AsyncMock(
            return_value=make_raw_response({"events": [{"type": "failover"}]})
        )

        response = await auth_client.get("/api/networks/net-1/backup-internet")

        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is True
        assert data["cellular_usage"] == {"bytes_used": 1024}
        assert data["cellular_events"] == [{"type": "failover"}]

    async def test_each_source_fails_soft(self, auth_client, authenticated_client):
        authenticated_client.get_backup_internet = AsyncMock(
            side_effect=EeroPremiumRequiredException("backup internet")
        )
        authenticated_client.get_cellular_backup_usage = AsyncMock(
            side_effect=EeroPremiumRequiredException("backup internet")
        )
        authenticated_client.get_cellular_backup_events = AsyncMock(
            side_effect=EeroPremiumRequiredException("backup internet")
        )

        response = await auth_client.get("/api/networks/net-1/backup-internet")

        assert response.status_code == 200
        data = response.json()
        assert data == {
            "enabled": None,
            "cellular_usage": None,
            "cellular_events": None,
        }


class TestBackupAccessPoints:
    """Tests for GET /api/networks/{network_id}/backup-access-points."""

    async def test_returns_access_points(self, auth_client, authenticated_client):
        authenticated_client.list_backup_access_points = AsyncMock(
            return_value=make_raw_response({"access_points": [{"ssid": "backup"}]})
        )

        response = await auth_client.get("/api/networks/net-1/backup-access-points")

        assert response.status_code == 200
        # Allowlisted (security review, 2026-09-24): only the known-safe
        # fields survive; a raw password/PSK in the entry would be dropped.
        access_points = response.json()["access_points"]
        assert len(access_points) == 1
        assert access_points[0]["ssid"] == "backup"
        assert "password" not in access_points[0]
