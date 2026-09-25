"""Tests for the backup-internet toggle write (phase-6.0-revamp.md WP7,
family 11)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroPremiumRequiredException


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateBackupInternet:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_backup_internet = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/backup-internet", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_backup_internet.assert_not_called()

    async def test_enabling_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_backup_internet = AsyncMock(
            side_effect=[
                make_raw_response({"enabled": False}),
                make_raw_response({"enabled": True}),
            ]
        )
        authenticated_client.set_backup_internet = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/backup-internet", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["enabled"] is True
        authenticated_client.set_backup_internet.assert_called_once_with(
            True, network_id="net-1"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_backup_internet = AsyncMock(
            return_value=make_raw_response({"enabled": False})
        )
        authenticated_client.set_backup_internet = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/backup-internet", json={"enabled": False}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.set_backup_internet.assert_not_called()

    async def test_premium_required_surfaces_as_402(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_backup_internet = AsyncMock(
            side_effect=EeroPremiumRequiredException("backup internet")
        )

        response = await auth_client.put(
            "/api/networks/net-1/backup-internet", json={"enabled": True}
        )

        assert response.status_code == 402
        assert response.json()["type"] == "premium_required"
