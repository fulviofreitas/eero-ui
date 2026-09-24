"""Tests for WP8 family 9: subnets.

PUT /api/networks/{network_id}/subnets              {config...}
DELETE /api/networks/{network_id}/subnets/{subnet_type}
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateSubnetConfig:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_subnets_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/subnets",
            json={"subnet_type": "main", "enabled": True},
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_subnets_config.assert_not_called()

    async def test_changes_when_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_subnets_config = AsyncMock(
            return_value=make_raw_response(
                {"subnets": [{"subnet_type": "main", "enabled": False}]}
            )
        )
        authenticated_client.set_subnets_config = AsyncMock(
            return_value=make_raw_response({"subnet_type": "main", "enabled": True})
        )

        response = await auth_client.put(
            "/api/networks/network-123/subnets",
            json={"subnet_type": "main", "enabled": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.set_subnets_config.assert_called_once_with(
            {"subnet_type": "main", "enabled": True}, network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_subnets_config = AsyncMock(
            return_value=make_raw_response(
                {"subnets": [{"subnet_type": "main", "enabled": True}]}
            )
        )
        authenticated_client.set_subnets_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/subnets",
            json={"subnet_type": "main", "enabled": True},
        )

        assert response.json()["changed"] is False
        authenticated_client.set_subnets_config.assert_not_called()

    async def test_password_never_echoed_and_always_writes(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_subnets_config = AsyncMock(
            return_value=make_raw_response(
                {"subnets": [{"subnet_type": "guest", "open_network": False}]}
            )
        )
        authenticated_client.set_subnets_config = AsyncMock(
            return_value=make_raw_response(
                {"subnet_type": "guest", "password": "super-secret"}
            )
        )

        response = await auth_client.put(
            "/api/networks/network-123/subnets",
            json={
                "subnet_type": "guest",
                "open_network": False,
                "password": "super-secret",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert "password" not in (data["subnet"] or {})

    async def test_unknown_field_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_subnets_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/subnets",
            json={"subnet_type": "main", "not_a_real_field": True},
        )

        assert response.status_code == 422
        authenticated_client.set_subnets_config.assert_not_called()

    async def test_oversized_name_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_subnets_config = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/subnets",
            json={"subnet_type": "main", "name": "x" * 100},
        )

        assert response.status_code == 422
        authenticated_client.set_subnets_config.assert_not_called()


class TestDeleteSubnet:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_subnet = AsyncMock()

        response = await auth_client.delete("/api/networks/network-123/subnets/guest")

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.delete_subnet.assert_not_called()

    async def test_deletes_when_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_subnet = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete("/api/networks/network-123/subnets/guest")

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.delete_subnet.assert_called_once_with(
            "guest", network_id="network-123"
        )

    async def test_invalid_subnet_type_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_subnet = AsyncMock()

        response = await auth_client.delete(
            "/api/networks/network-123/subnets/..%2f..%2fetc"
        )

        assert response.status_code in (400, 404, 405)
        authenticated_client.delete_subnet.assert_not_called()
