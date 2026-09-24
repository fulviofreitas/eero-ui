"""Tests for WP8 family 4-5: fast transition, Passpoint, proxied nodes.

PUT /api/networks/{network_id}/fast-transition  {enabled}
PUT /api/networks/{network_id}/passpoint        {enabled}
PUT /api/networks/{network_id}/proxied-nodes    {enabled}
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestUpdateFastTransition:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_fast_transition = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/fast-transition", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_fast_transition.assert_not_called()

    async def test_changes_when_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_fast_transition = AsyncMock(
            return_value=make_raw_response({"fast_transition": False})
        )
        authenticated_client.set_fast_transition = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/fast-transition", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        assert data["enabled"] is True
        authenticated_client.set_fast_transition.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_fast_transition = AsyncMock(
            return_value=make_raw_response({"fast_transition": True})
        )
        authenticated_client.set_fast_transition = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/fast-transition", json={"enabled": True}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_fast_transition.assert_not_called()

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_fast_transition = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/fast-transition",
            json={"enabled": "not-a-bool"},
        )

        assert response.status_code == 422
        authenticated_client.set_fast_transition.assert_not_called()


class TestUpdatePasspoint:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_passpoint_enabled = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/passpoint", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_passpoint_enabled.assert_not_called()

    async def test_changes_when_known_and_different(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"passpoint": False})
        )
        authenticated_client.set_passpoint_enabled = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/passpoint", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.set_passpoint_enabled.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_no_op_when_known_and_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(
            return_value=make_raw_response({"passpoint": True})
        )
        authenticated_client.set_passpoint_enabled = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/passpoint", json={"enabled": True}
        )

        assert response.json()["changed"] is False
        authenticated_client.set_passpoint_enabled.assert_not_called()

    async def test_writes_when_no_op_guard_unavailable(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_network = AsyncMock(return_value=make_raw_response({}))
        authenticated_client.set_passpoint_enabled = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/passpoint", json={"enabled": True}
        )

        assert response.json()["changed"] is True
        authenticated_client.set_passpoint_enabled.assert_called_once()

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_passpoint_enabled = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/passpoint", json={"enabled": "not-a-bool"}
        )

        assert response.status_code == 422
        authenticated_client.set_passpoint_enabled.assert_not_called()


class TestUpdateProxiedNodes:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_proxied_nodes = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/proxied-nodes", json={"enabled": True}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_proxied_nodes.assert_not_called()

    async def test_always_writes_no_reliable_guard(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """No reliable no-op guard exists (documented gap): every call writes."""
        authenticated_client.set_proxied_nodes = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/networks/network-123/proxied-nodes", json={"enabled": True}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert data["reboot_expected"] is True
        authenticated_client.set_proxied_nodes.assert_called_once_with(
            True, network_id="network-123"
        )

    async def test_single_write_per_request(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_proxied_nodes = AsyncMock(
            return_value=make_raw_response({})
        )

        await auth_client.put(
            "/api/networks/network-123/proxied-nodes", json={"enabled": False}
        )

        assert authenticated_client.set_proxied_nodes.call_count == 1

    async def test_invalid_body_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_proxied_nodes = AsyncMock()

        response = await auth_client.put(
            "/api/networks/network-123/proxied-nodes", json={"enabled": "not-a-bool"}
        )

        assert response.status_code == 422
        authenticated_client.set_proxied_nodes.assert_not_called()
