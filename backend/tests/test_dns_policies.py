"""Tests for DNS policies / advanced content filtering (phase-6.0-revamp.md
WP7, family 10)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroPremiumRequiredException


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestGetContentFilter:
    async def test_returns_lists_not_gated(self, auth_client, authenticated_client):
        authenticated_client.get_advanced_content_filter = AsyncMock(
            return_value=make_raw_response(
                {"allowed_list": ["good.com"], "blocked_list": ["bad.com"]}
            )
        )

        response = await auth_client.get("/api/networks/net-1/content-filter")

        assert response.status_code == 200
        assert response.json() == {
            "allowed_list": ["good.com"],
            "blocked_list": ["bad.com"],
        }

    async def test_premium_required_surfaces_as_402(
        self, auth_client, authenticated_client
    ):
        authenticated_client.get_advanced_content_filter = AsyncMock(
            side_effect=EeroPremiumRequiredException("content filter")
        )

        response = await auth_client.get("/api/networks/net-1/content-filter")

        assert response.status_code == 402
        assert response.json()["type"] == "premium_required"


class TestAllowDomain:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.allow_domain = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow", json={"domain": "good.com"}
        )

        assert response.status_code == 403
        authenticated_client.allow_domain.assert_not_called()

    async def test_valid_domain_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.allow_domain = AsyncMock(
            return_value=make_raw_response(
                {"allowed_list": ["good.com"], "blocked_list": []}
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow", json={"domain": "GOOD.com"}
        )

        assert response.status_code == 200
        authenticated_client.allow_domain.assert_called_once_with(
            "good.com", network_id="net-1", add_cname=None
        )

    async def test_invalid_domain_rejected_before_sdk_call(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.allow_domain = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow",
            json={"domain": "https://good.com/path"},
        )

        assert response.status_code == 422
        authenticated_client.allow_domain.assert_not_called()

    async def test_bare_scheme_domain_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L1: 'http://x' - rejected on the scheme check, before any of the
        length/IP/IDNA checks run."""
        authenticated_client.allow_domain = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow",
            json={"domain": "http://x"},
        )

        assert response.status_code == 422
        authenticated_client.allow_domain.assert_not_called()

    async def test_oversized_domain_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L1: a 254-character domain exceeds the 253-character DNS
        wire-format ceiling."""
        authenticated_client.allow_domain = AsyncMock()
        oversized = ("a" * 250) + ".com"
        assert len(oversized) == 254

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow",
            json={"domain": oversized},
        )

        assert response.status_code == 422
        authenticated_client.allow_domain.assert_not_called()

    async def test_ip_literal_domain_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L1: an IP literal is never a valid content-filter domain."""
        authenticated_client.allow_domain = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow",
            json={"domain": "10.0.0.1"},
        )

        assert response.status_code == 422
        authenticated_client.allow_domain.assert_not_called()

    async def test_idn_domain_accepted_and_forwarded_as_punycode(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L1: a non-ASCII (IDN) domain is accepted and forwarded to the SDK
        ASCII-encoded (punycode), matching DNS wire format."""
        authenticated_client.allow_domain = AsyncMock(
            return_value=make_raw_response(
                {"allowed_list": ["xn--bcher-kva.example"], "blocked_list": []}
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow",
            json={"domain": "bücher.example"},
        )

        assert response.status_code == 200
        authenticated_client.allow_domain.assert_called_once_with(
            "xn--bcher-kva.example", network_id="net-1", add_cname=None
        )

    async def test_delete_calls_is_delete_true(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.allow_domain = AsyncMock(
            return_value=make_raw_response({"allowed_list": [], "blocked_list": []})
        )

        response = await auth_client.request(
            "DELETE",
            "/api/networks/net-1/content-filter/allow",
            json={"domain": "good.com"},
        )

        assert response.status_code == 200
        authenticated_client.allow_domain.assert_called_once_with(
            "good.com", network_id="net-1", is_delete=True
        )


class TestBlockDomain:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.block_domain = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/block", json={"domain": "bad.com"}
        )

        assert response.status_code == 403
        authenticated_client.block_domain.assert_not_called()

    async def test_valid_domain_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.block_domain = AsyncMock(
            return_value=make_raw_response(
                {"allowed_list": [], "blocked_list": ["bad.com"]}
            )
        )

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/block", json={"domain": "bad.com"}
        )

        assert response.status_code == 200
        authenticated_client.block_domain.assert_called_once_with(
            "bad.com", network_id="net-1"
        )

    async def test_delete_calls_is_delete_true(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.block_domain = AsyncMock(
            return_value=make_raw_response({"allowed_list": [], "blocked_list": []})
        )

        response = await auth_client.request(
            "DELETE",
            "/api/networks/net-1/content-filter/block",
            json={"domain": "bad.com"},
        )

        assert response.status_code == 200
        authenticated_client.block_domain.assert_called_once_with(
            "bad.com", network_id="net-1", is_delete=True
        )


class TestDomainForProfiles:
    async def test_allow_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.allow_domain_for_profiles = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow-for-profiles",
            json={"domain": "good.com", "profiles": ["profile-1"]},
        )

        assert response.status_code == 403
        authenticated_client.allow_domain_for_profiles.assert_not_called()

    async def test_allow_for_profiles_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.allow_domain_for_profiles = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow-for-profiles",
            json={"domain": "good.com", "profiles": ["profile-1"]},
        )

        assert response.status_code == 200
        authenticated_client.allow_domain_for_profiles.assert_called_once_with(
            "good.com",
            network_id="net-1",
            profiles=["profile-1"],
            override=None,
            add_cname=None,
        )

    async def test_block_for_profiles_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.block_domain_for_profiles = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/block-for-profiles",
            json={"domain": "bad.com", "profiles": ["profile-1"]},
        )

        assert response.status_code == 200
        authenticated_client.block_domain_for_profiles.assert_called_once_with(
            "bad.com", network_id="net-1", profiles=["profile-1"], override=None
        )

    async def test_oversized_profiles_list_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: profiles is capped at 100 entries."""
        authenticated_client.allow_domain_for_profiles = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/allow-for-profiles",
            json={
                "domain": "good.com",
                "profiles": [f"profile-{i}" for i in range(101)],
            },
        )

        assert response.status_code == 422
        authenticated_client.allow_domain_for_profiles.assert_not_called()

    async def test_invalid_profile_id_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: each profiles entry must be a valid bare identifier."""
        authenticated_client.block_domain_for_profiles = AsyncMock()

        response = await auth_client.post(
            "/api/networks/net-1/content-filter/block-for-profiles",
            json={"domain": "bad.com", "profiles": ["../etc/passwd"]},
        )

        assert response.status_code == 422
        authenticated_client.block_domain_for_profiles.assert_not_called()


class TestProfileBlockedApplications:
    async def test_get_not_gated(self, auth_client, authenticated_client):
        authenticated_client.get_dns_policy_applications = AsyncMock(
            return_value=make_raw_response({"applications": ["tiktok"]})
        )

        response = await auth_client.get("/api/profiles/profile-1/blocked-applications")

        assert response.status_code == 200
        assert response.json() == {"applications": ["tiktok"]}

    async def test_put_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_profile_blocked_applications = AsyncMock()

        response = await auth_client.put(
            "/api/profiles/profile-1/blocked-applications",
            json={"applications": ["tiktok"]},
        )

        assert response.status_code == 403
        authenticated_client.set_profile_blocked_applications.assert_not_called()

    async def test_put_calls_sdk(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_profile_blocked_applications = AsyncMock(
            return_value=make_raw_response({"applications": ["tiktok"]})
        )

        response = await auth_client.put(
            "/api/profiles/profile-1/blocked-applications",
            json={"applications": ["tiktok"]},
        )

        assert response.status_code == 200
        authenticated_client.set_profile_blocked_applications.assert_called_once_with(
            "profile-1", ["tiktok"], network_id="network-123"
        )

    async def test_premium_required_surfaces_as_402(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_profile_blocked_applications = AsyncMock(
            side_effect=EeroPremiumRequiredException("dns policies")
        )

        response = await auth_client.put(
            "/api/profiles/profile-1/blocked-applications",
            json={"applications": ["tiktok"]},
        )

        assert response.status_code == 402

    async def test_oversized_applications_list_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: applications is capped at 100 entries."""
        authenticated_client.set_profile_blocked_applications = AsyncMock()

        response = await auth_client.put(
            "/api/profiles/profile-1/blocked-applications",
            json={"applications": [f"app-{i}" for i in range(101)]},
        )

        assert response.status_code == 422
        authenticated_client.set_profile_blocked_applications.assert_not_called()

    async def test_invalid_application_id_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        """L2: each applications entry must be a valid bare identifier."""
        authenticated_client.set_profile_blocked_applications = AsyncMock()

        response = await auth_client.put(
            "/api/profiles/profile-1/blocked-applications",
            json={"applications": ["../etc/passwd"]},
        )

        assert response.status_code == 422
        authenticated_client.set_profile_blocked_applications.assert_not_called()
