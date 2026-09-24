"""Tests for backup access points writes (phase-6.0-revamp.md WP7, family 5)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestCreateBackupAccessPoint:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.add_backup_access_point = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points",
            json={"ssid": "backup-net", "password": "correct-horse-battery"},
        )

        assert response.status_code == 403
        authenticated_client.add_backup_access_point.assert_not_called()

    async def test_creates_ap_without_echoing_password(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.add_backup_access_point = AsyncMock(
            return_value=make_raw_response(
                {
                    "url": "/2.2/networks/net-1/backup_access_points/ap-1",
                    "ssid": "backup-net",
                    "password": "correct-horse-battery",
                    "enabled": True,
                }
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points",
            json={"ssid": "backup-net", "password": "correct-horse-battery"},
        )

        assert response.status_code == 201
        assert "correct-horse-battery" not in response.text
        assert "password" not in response.json()
        authenticated_client.add_backup_access_point.assert_called_once_with(
            network_id="net-1",
            ssid="backup-net",
            password="correct-horse-battery",
            uuid=None,
        )

    async def test_short_password_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.add_backup_access_point = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points",
            json={"ssid": "backup-net", "password": "short"},
        )

        assert response.status_code == 422
        authenticated_client.add_backup_access_point.assert_not_called()


class TestUpdateBackupAccessPoint:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.update_backup_access_point = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/backup-access-points/ap-1", json={"enabled": False}
        )

        assert response.status_code == 403
        authenticated_client.update_backup_access_point.assert_not_called()

    async def test_updates_ap(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.update_backup_access_point = AsyncMock(
            return_value=make_raw_response({"ssid": "backup-net", "enabled": False})
        )

        response = await auth_client.put(
            "/api/networks/net-1/backup-access-points/ap-1", json={"enabled": False}
        )

        assert response.status_code == 200
        authenticated_client.update_backup_access_point.assert_called_once_with(
            "ap-1", network_id="net-1", ssid=None, password=None, enabled=False
        )


class TestDeleteBackupAccessPoint:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_backup_access_point = AsyncMock()

        response = await auth_client.delete(
            "/api/networks/net-1/backup-access-points/ap-1"
        )

        assert response.status_code == 403
        authenticated_client.delete_backup_access_point.assert_not_called()

    async def test_deletes_ap(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_backup_access_point = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete(
            "/api/networks/net-1/backup-access-points/ap-1"
        )

        assert response.status_code == 200
        assert response.json()["success"] is True


class TestReorderBackupAccessPoints:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.rearrange_backup_access_points = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/backup-access-points/order",
            json={"order": ["ap-2", "ap-1"]},
        )

        assert response.status_code == 403
        authenticated_client.rearrange_backup_access_points.assert_not_called()

    async def test_reorders_and_is_not_captured_as_ap_id(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Regression guard: /order must route to the reorder handler, not
        the {ap_id} update handler with ap_id="order"."""
        authenticated_client.rearrange_backup_access_points = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.update_backup_access_point = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/backup-access-points/order",
            json={"order": ["ap-2", "ap-1"]},
        )

        assert response.status_code == 200
        authenticated_client.rearrange_backup_access_points.assert_called_once_with(
            ["ap-2", "ap-1"], network_id="net-1"
        )
        authenticated_client.update_backup_access_point.assert_not_called()

    async def test_oversized_order_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: order is capped at 100 entries."""
        authenticated_client.rearrange_backup_access_points = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/backup-access-points/order",
            json={"order": [f"ap-{i}" for i in range(101)]},
        )

        assert response.status_code == 422
        authenticated_client.rearrange_backup_access_points.assert_not_called()


class TestDiscoverBackupSsids:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.start_backup_ssid_discovery = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points/discover"
        )

        assert response.status_code == 403
        authenticated_client.start_backup_ssid_discovery.assert_not_called()

    async def test_discovers_ssids(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.start_backup_ssid_discovery = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.discover_backup_ssids = AsyncMock(
            return_value=make_raw_response({"ssids": [{"ssid": "neighbor-net"}]})
        )

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points/discover"
        )

        assert response.status_code == 200
        assert response.json()["ssids"] == [
            {
                "ssid": "neighbor-net",
                "uuid": None,
                "status": None,
                "connectivity": None,
                "signal": None,
                "timestamp": None,
            }
        ]

    async def test_unknown_and_sensitive_keys_dropped(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L3: the upstream shape is unfixtured - allowlisted fields pass
        through, everything else (including a PSK-shaped key) is dropped."""
        authenticated_client.start_backup_ssid_discovery = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.discover_backup_ssids = AsyncMock(
            return_value=make_raw_response(
                {
                    "ssids": [
                        {
                            "ssid": "neighbor-net",
                            "uuid": "uuid-1",
                            "status": "detected",
                            "psk": "should-never-appear",
                            "unexpected_field": "dropped",
                        }
                    ]
                }
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points/discover"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["ssids"] == [
            {
                "ssid": "neighbor-net",
                "uuid": "uuid-1",
                "status": "detected",
                "connectivity": None,
                "signal": None,
                "timestamp": None,
            }
        ]
        assert "psk" not in response.text
        assert "should-never-appear" not in response.text


class TestBackupConnectivityCheck:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.backup_connectivity_check = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points/check"
        )

        assert response.status_code == 403
        authenticated_client.backup_connectivity_check.assert_not_called()

    async def test_runs_check(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.backup_connectivity_check = AsyncMock(
            return_value=make_raw_response(
                {"status": "connected", "ssid": "backup-net"}
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points/check"
        )

        assert response.status_code == 200
        assert response.json()["status"] == "connected"
        assert response.json()["ssid"] == "backup-net"

    async def test_unknown_key_dropped_from_response(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L3: the upstream shape is unfixtured - an unrecognised key must
        be dropped, never forwarded raw to the frontend."""
        authenticated_client.backup_connectivity_check = AsyncMock(
            return_value=make_raw_response(
                {"status": "connected", "psk": "should-never-appear"}
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/backup-access-points/check"
        )

        assert response.status_code == 200
        assert "psk" not in response.text
        assert "should-never-appear" not in response.text
