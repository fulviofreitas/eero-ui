"""Tests for GET /api/networks/{network_id}/entitlements (WP6 deliverable 1)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroAccessDeniedException, EeroPremiumRequiredException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestEntitlements:
    """Tests for GET /api/networks/{network_id}/entitlements."""

    async def test_returns_all_sources_combined(
        self, auth_client, authenticated_client
    ):
        """Happy path: every source contributes to the combined response."""
        authenticated_client.get_entitlement_features = AsyncMock(
            return_value=make_raw_response({"features": [{"key": "eero_plus"}]})
        )
        authenticated_client.get_upsell_features = AsyncMock(
            return_value=make_raw_response(
                {"upsell_features": [{"key": "eero_secure"}]}
            )
        )
        authenticated_client.get_model_capabilities = AsyncMock(
            return_value=make_raw_response({"models": [{"model": "eero6"}]})
        )
        authenticated_client.get_premium_customer = AsyncMock(
            return_value=make_raw_response({"is_premium": True})
        )
        authenticated_client.get_premium_status = AsyncMock(
            return_value=make_raw_response(
                {
                    "premium_status": {"active": True},
                    "eero_plus": True,
                    "premium_dns": True,
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["features"] == [{"key": "eero_plus"}]
        assert data["upsell_features"] == [{"key": "eero_secure"}]
        assert data["capabilities"] == [{"model": "eero6"}]
        assert data["is_premium"] is True
        assert data["premium_status"] == {
            "active": True,
            "eero_plus": True,
            "premium_dns": True,
        }
        assert data["experimental_writes"] is False

        authenticated_client.get_entitlement_features.assert_called_once_with(
            network_id="net-1"
        )
        authenticated_client.get_upsell_features.assert_called_once_with(
            network_id="net-1"
        )
        authenticated_client.get_model_capabilities.assert_called_once_with(
            network_id="net-1"
        )
        authenticated_client.get_premium_customer.assert_called_once_with()
        authenticated_client.get_premium_status.assert_called_once_with(
            network_id="net-1"
        )

    async def test_each_source_fails_soft_independently(
        self, auth_client, authenticated_client
    ):
        """A denied/failing source degrades to its default value, not a 500."""
        authenticated_client.get_entitlement_features = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )
        authenticated_client.get_upsell_features = AsyncMock(
            side_effect=EeroPremiumRequiredException("upsell")
        )
        authenticated_client.get_model_capabilities = AsyncMock(
            return_value=make_raw_response({"models": []})
        )
        authenticated_client.get_premium_customer = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )
        authenticated_client.get_premium_status = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["features"] == []
        assert data["upsell_features"] == []
        assert data["is_premium"] is None
        assert data["premium_status"] is None
        assert data["capabilities"] == []

    async def test_experimental_writes_flag_mirrors_health(
        self, auth_client, authenticated_client
    ):
        """The response carries the same flag as /api/health (decision 6a)."""
        authenticated_client.get_entitlement_features = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_upsell_features = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_model_capabilities = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_premium_customer = AsyncMock(
            return_value=make_raw_response({})
        )
        authenticated_client.get_premium_status = AsyncMock(
            return_value=make_raw_response({})
        )

        entitlements = await auth_client.get("/api/networks/net-1/entitlements")
        health = await auth_client.get("/api/health")

        assert (
            entitlements.json()["experimental_writes"]
            == health.json()["experimental_writes"]
        )

    async def test_requires_auth(self, async_client):
        """Unauthenticated callers get 401."""
        response = await async_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 401
