"""Tests for Thread writes (phase-6.0-revamp.md WP7, family 7)."""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateThread:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_thread_enabled = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/thread", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_thread_enabled.assert_not_called()

    async def test_enabling_without_syncing_uses_set_thread_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_thread = AsyncMock(
            side_effect=[
                make_raw_response({"enabled": False}),
                make_raw_response({"enabled": True, "name": "eero-thread"}),
            ]
        )
        authenticated_client.set_thread_enabled = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/thread", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["thread"]["enabled"] is True
        authenticated_client.set_thread_enabled.assert_called_once_with(
            True, network_id="net-1"
        )

    async def test_with_credential_syncing_uses_update_thread(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_thread = AsyncMock(
            return_value=make_raw_response(
                {"enabled": True, "enable_credential_syncing": False}
            )
        )
        authenticated_client.update_thread = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/thread",
            json={"enabled": True, "enable_credential_syncing": True},
        )

        assert response.status_code == 200
        authenticated_client.update_thread.assert_called_once_with(
            thread_enable=True,
            enable_credential_syncing=True,
            network_id="net-1",
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_thread = AsyncMock(
            return_value=make_raw_response({"enabled": True})
        )
        authenticated_client.set_thread_enabled = AsyncMock()
        authenticated_client.update_thread = AsyncMock()

        response = await auth_client.put(
            "/api/networks/net-1/thread", json={"enabled": True}
        )

        assert response.status_code == 200
        assert response.json()["changed"] is False
        authenticated_client.set_thread_enabled.assert_not_called()
        authenticated_client.update_thread.assert_not_called()

    async def test_response_never_carries_thread_credential(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """The ThreadSummary model is allowlisted - a raw key/dataset/PSKc
        in the SDK response must never reach the client."""
        authenticated_client.get_thread = AsyncMock(
            side_effect=[
                make_raw_response({"enabled": False}),
                make_raw_response(
                    {"enabled": True, "network_key": "super-secret-thread-key"}
                ),
            ]
        )
        authenticated_client.set_thread_enabled = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/net-1/thread", json={"enabled": True}
        )

        assert "network_key" not in response.text
        assert "super-secret-thread-key" not in response.text


class TestRegenerateThreadCredentials:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.regenerate_thread_credentials = AsyncMock()

        response = await auth_client.post("/api/networks/net-1/thread/regenerate")

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"

    async def test_regenerate_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.regenerate_thread_credentials = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/networks/net-1/thread/regenerate")

        assert response.status_code == 200
        assert response.json()["success"] is True
        authenticated_client.regenerate_thread_credentials.assert_called_once_with(
            network_id="net-1"
        )
