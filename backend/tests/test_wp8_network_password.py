"""Tests for WP8 family 12: network Wi-Fi password.

PUT /api/networks/{network_id}/password    {password}
DELETE /api/networks/{network_id}/password

Not in § 5's settings-class table (it PUTs the network's own `password`
link, not `settings`), but disconnects every client and has not been
confirmed live, so it carries the same danger-dialog contract:
`reboot_expected: false`, `disconnects_clients: true`. No no-op guard is
possible - the API never returns a password to compare against.
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestSetNetworkPassword:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_network_password = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/password", json={"password": "correct-horse"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_network_password.assert_not_called()

    async def test_sets_password_when_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_network_password = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/password", json={"password": "correct-horse"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["changed"] is True
        assert data["reboot_expected"] is False
        assert data["disconnects_clients"] is True
        assert "password" not in data
        authenticated_client.set_network_password.assert_called_once_with(
            "correct-horse", network_id="network-123"
        )

    async def test_password_never_logged_or_echoed(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_network_password = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/password", json={"password": "correct-horse"}
        )

        assert "correct-horse" not in response.text

    async def test_too_short_password_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_network_password = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/password", json={"password": "short"}
        )

        assert response.status_code == 422
        authenticated_client.set_network_password.assert_not_called()

    async def test_too_long_password_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_network_password = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/password", json={"password": "x" * 64}
        )

        assert response.status_code == 422
        authenticated_client.set_network_password.assert_not_called()

    async def test_non_printable_password_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_network_password = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/password",
            json={"password": "abcdefgh\n"},
        )

        assert response.status_code == 422
        authenticated_client.set_network_password.assert_not_called()


class TestClearNetworkPassword:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.clear_network_password = AsyncMock()

        response = await auth_client.request(
            "DELETE",
            "/api/networks/network-123/password",
            json={"confirm_open_network": True},
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.clear_network_password.assert_not_called()

    async def test_clears_when_enabled(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.clear_network_password = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.request(
            "DELETE",
            "/api/networks/network-123/password",
            json={"confirm_open_network": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is False
        assert data["disconnects_clients"] is True
        assert data["open_network"] is True
        authenticated_client.clear_network_password.assert_called_once_with(
            "network-123"
        )

    async def test_without_confirmation_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """Security review, 2026-09-24 (S3): an empty-body DELETE must not
        open the network."""
        authenticated_client.clear_network_password = AsyncMock()

        response = await auth_client.request(
            "DELETE",
            "/api/networks/network-123/password",
            json={"confirm_open_network": False},
        )

        assert response.status_code == 422
        authenticated_client.clear_network_password.assert_not_called()
