"""Tests for members/invites writes (phase-6.0-revamp.md WP7, family 2)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestCreateInvite:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.create_invite = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/invites", json={"role": "admin"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.create_invite.assert_not_called()

    async def test_creates_invite_without_leaking_invite_url(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_invite = AsyncMock(
            return_value=make_raw_response(
                {
                    "invite_id": "inv-1",
                    "invite_role": "admin",
                    "invite_url": "https://eero.com/join/secret-token",
                    "url": "/2.2/networks/net-1/invites/inv-1",
                }
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/invites", json={"role": "admin"}
        )

        assert response.status_code == 201
        assert "invite_url" not in response.text
        assert response.json() == {"id": "inv-1", "role": "admin"}
        authenticated_client.create_invite.assert_called_once_with(
            role="admin", network_id="net-1"
        )

    async def test_invalid_role_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.create_invite = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/invites", json={"role": "superadmin"}
        )

        assert response.status_code == 422
        authenticated_client.create_invite.assert_not_called()


class TestUpdateInvite:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.update_invite = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/invites/inv-1", json={"nickname": "Grandma"}
        )

        assert response.status_code == 403
        authenticated_client.update_invite.assert_not_called()

    async def test_renames_invite(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.update_invite = AsyncMock(
            return_value=make_raw_response(
                {"invite_role": "admin", "url": "/2.2/networks/net-1/invites/inv-1"}
            )
        )

        response = await auth_client.put(
            "/api/networks/net-1/invites/inv-1", json={"nickname": "Grandma"}
        )

        assert response.status_code == 200
        authenticated_client.update_invite.assert_called_once_with(
            "inv-1", invite_nickname="Grandma", network_id="net-1"
        )


class TestDeleteInvite:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.delete_invite = AsyncMock()

        response = await auth_client.delete("/api/networks/net-1/invites/inv-1")

        assert response.status_code == 403
        authenticated_client.delete_invite.assert_not_called()

    async def test_deletes_invite(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.delete_invite = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete("/api/networks/net-1/invites/inv-1")

        assert response.status_code == 200
        assert response.json()["success"] is True


class TestPromoteMember:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.promote_member = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/members/member-1/promote"
        )

        assert response.status_code == 403
        authenticated_client.promote_member.assert_not_called()

    async def test_promotes_member(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.promote_member = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            "/api/networks/net-1/members/member-1/promote"
        )

        assert response.status_code == 200
        authenticated_client.promote_member.assert_called_once_with(
            "member-1", network_id="net-1"
        )


class TestRemoveAdmin:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.remove_admin = AsyncMock()

        response = await auth_client.delete("/api/networks/net-1/admins/user-1")

        assert response.status_code == 403
        authenticated_client.remove_admin.assert_not_called()

    async def test_removes_admin(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.remove_admin = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.delete("/api/networks/net-1/admins/user-1")

        assert response.status_code == 200
        authenticated_client.remove_admin.assert_called_once_with(
            "user-1", network_id="net-1"
        )


class TestCancelPendingAdmin:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.cancel_pending_admin = AsyncMock()

        response = await auth_client.post("/api/networks/net-1/pending-admin/cancel")

        assert response.status_code == 403
        authenticated_client.cancel_pending_admin.assert_not_called()

    async def test_cancels_pending_admin(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.cancel_pending_admin = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/networks/net-1/pending-admin/cancel")

        assert response.status_code == 200
        authenticated_client.cancel_pending_admin.assert_called_once_with(
            network_id="net-1"
        )
