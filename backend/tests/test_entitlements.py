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


class TestEntitlementsPremiumSignalDerivation:
    """Tests for the tri-state ``is_premium`` derivation (production
    report, 2026-09-25: "I have eero Plus and can't see advanced info").

    Real network envelopes have been seen sending ``premium_status`` as a
    bare string (``"active"``) rather than a ``{"active": true}`` dict
    (eero-api tests/conftest.py, tests/integration/conftest.py) - the
    previous code only ever checked the dict shape, so ``is_premium``
    stayed false/null for real Plus accounts using this shape.
    """

    @staticmethod
    def _stub_feature_sources(authenticated_client, **overrides):
        """Wire up empty/default responses for every entitlements source,
        then apply any overrides."""
        defaults = {
            "get_entitlement_features": make_raw_response({"features": []}),
            "get_upsell_features": make_raw_response({"upsell_features": []}),
            "get_model_capabilities": make_raw_response({"models": []}),
            "get_premium_customer": make_raw_response({}),
            "get_premium_status": make_raw_response({}),
        }
        defaults.update(overrides)
        for method, value in defaults.items():
            setattr(authenticated_client, method, AsyncMock(return_value=value))

    async def test_premium_status_string_shape_is_a_positive_signal(
        self, auth_client, authenticated_client
    ):
        """``premium_status: "active"`` (a bare string) must count as a
        positive premium signal."""
        self._stub_feature_sources(
            authenticated_client,
            get_premium_status=make_raw_response({"premium_status": "active"}),
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is True
        assert "premium_status:active" in data["premium_signals"]
        assert data["premium_tier"] == "active"

    async def test_premium_details_tier_is_a_positive_signal(
        self, auth_client, authenticated_client
    ):
        """A ``premium_details.tier`` value of ``"plus"`` must count as a
        positive premium signal, with no other source contributing."""
        self._stub_feature_sources(
            authenticated_client,
            get_premium_status=make_raw_response({"premium_details": {"tier": "plus"}}),
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is True
        assert data["premium_tier"] == "plus"
        assert any(
            s.startswith("premium_details.tier:") for s in data["premium_signals"]
        )

    async def test_premium_customer_endpoint_alone_is_a_positive_signal(
        self, auth_client, authenticated_client
    ):
        """``is_premium`` from the account-level customer endpoint alone
        must count, with no signal from the network-scoped sources."""
        self._stub_feature_sources(
            authenticated_client,
            get_premium_customer=make_raw_response({"is_premium": True}),
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is True
        assert "premium_customer.is_premium" in data["premium_signals"]

    async def test_feature_name_alone_is_a_positive_signal(
        self, auth_client, authenticated_client
    ):
        """A feature entry whose name hints at a premium-only capability
        (e.g. "backup") must count, with no other source contributing."""
        self._stub_feature_sources(
            authenticated_client,
            get_entitlement_features=make_raw_response(
                {"features": [{"name": "backup_internet"}]}
            ),
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is True
        assert any(s.startswith("features:") for s in data["premium_signals"])

    async def test_no_positive_signal_from_successful_sources_is_false(
        self, auth_client, authenticated_client
    ):
        """Every source answers successfully but shows no premium
        indication: ``is_premium`` must be an explicit ``False``, not
        ``None`` (distinct from "we never got an answer")."""
        self._stub_feature_sources(authenticated_client)

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is False
        assert data["premium_signals"] == []

    async def test_premium_status_unrecognised_string_is_not_a_crash(
        self, auth_client, authenticated_client
    ):
        """An unrecognised ``premium_status`` string must be ignored, not
        raise and not be assumed positive."""
        self._stub_feature_sources(
            authenticated_client,
            get_premium_status=make_raw_response(
                {"premium_status": "some-unexpected-value"}
            ),
        )

        response = await auth_client.get("/api/networks/net-1/entitlements")

        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] is False
