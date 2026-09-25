"""Tests for permissions/members/invites reads (WP6 deliverable 10)."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroAccessDeniedException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


class TestPermissions:
    """Tests for GET /api/networks/{network_id}/permissions."""

    async def test_returns_permissions(self, auth_client, authenticated_client):
        authenticated_client.get_permissions = AsyncMock(
            return_value=make_raw_response(
                {"permissions": {"network.admin_invites": True}, "role": "OWNER"}
            )
        )

        response = await auth_client.get("/api/networks/net-1/permissions")

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "OWNER"
        assert data["permissions"] == {"network.admin_invites": True}
        assert data["partial"] is False

    async def test_access_denied_fails_soft(self, auth_client, authenticated_client):
        authenticated_client.get_permissions = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/permissions")

        assert response.status_code == 200
        data = response.json()
        assert data["partial"] is True
        assert data["permissions"] == {}

    async def test_non_bool_permission_values_dropped_not_500(
        self, auth_client, authenticated_client
    ):
        """A real envelope may send a non-bool permission value (e.g. a
        nested object or a free-text string). It must be dropped, never
        raise a response-validation 500."""
        authenticated_client.get_permissions = AsyncMock(
            return_value=make_raw_response(
                {
                    "permissions": {
                        "network.admin_invites": True,
                        "network.weird": ["nested", "list"],
                        "network.other": "not-a-bool-token",
                    },
                    "role": "OWNER",
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/permissions")

        assert response.status_code == 200
        data = response.json()
        assert data["permissions"] == {"network.admin_invites": True}
        assert data["partial"] is True

    async def test_role_nested_under_user_recovered(
        self, auth_client, authenticated_client
    ):
        """``role`` may be nested under ``user`` instead of top-level."""
        authenticated_client.get_permissions = AsyncMock(
            return_value=make_raw_response(
                {"permissions": {}, "user": {"role": "ADMIN"}}
            )
        )

        response = await auth_client.get("/api/networks/net-1/permissions")

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "ADMIN"


class TestMembers:
    """Tests for GET /api/networks/{network_id}/members."""

    async def test_returns_members(self, auth_client, authenticated_client):
        authenticated_client.get_members = AsyncMock(
            return_value=make_raw_response(
                {"members": [{"user_name": "alice", "role": "OWNER"}]}
            )
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        # Allowlisted (security review, 2026-09-24): no raw email/phone
        # field, even though the raw entry didn't carry one here.
        assert response.json() == {
            "members": [{"name": "alice", "role": "OWNER", "status": None}],
            "partial": False,
        }

    async def test_access_denied_fails_soft(self, auth_client, authenticated_client):
        authenticated_client.get_members = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        assert response.json() == {"members": [], "partial": True}

    async def test_name_as_structured_object_is_stringified(
        self, auth_client, authenticated_client
    ):
        """A real member envelope may send ``name`` as a structured
        object (eero-api tests/conftest.py ``sample_account_response``)
        rather than a bare string - this must never 500."""
        authenticated_client.get_members = AsyncMock(
            return_value=make_raw_response(
                {
                    "members": [
                        {
                            "name": {"first": "Ada", "last": "Lovelace"},
                            "role": "OWNER",
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        data = response.json()
        assert data["members"] == [
            {"name": "Ada Lovelace", "role": "OWNER", "status": None}
        ]
        assert data["partial"] is False

    async def test_role_nested_under_user_and_non_string_status(
        self, auth_client, authenticated_client
    ):
        """``role`` may be nested under ``user``; ``status`` may arrive as
        a non-string scalar (e.g. a timestamp)."""
        authenticated_client.get_members = AsyncMock(
            return_value=make_raw_response(
                {
                    "members": [
                        {
                            "user_name": "bob",
                            "user": {"role": "ADMIN"},
                            "status": 1700000000,
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        data = response.json()
        assert data["members"] == [
            {"name": "bob", "role": "ADMIN", "status": "1700000000"}
        ]
        assert data["partial"] is False

    async def test_dict_keyed_by_id_shape_recovered(
        self, auth_client, authenticated_client
    ):
        """``get_members`` may return a dict keyed by member id instead
        of ``{"members": [...]}``."""
        authenticated_client.get_members = AsyncMock(
            return_value=make_raw_response(
                {
                    "member_1": {"user_name": "alice", "role": "OWNER"},
                    "member_2": {"user_name": "bob", "role": "ADMIN"},
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        data = response.json()
        assert data["partial"] is False
        assert {m["name"] for m in data["members"]} == {"alice", "bob"}

    async def test_non_dict_member_entries_dropped_not_500(
        self, auth_client, authenticated_client
    ):
        """A stray non-dict entry in the members list must be dropped,
        not raised on."""
        authenticated_client.get_members = AsyncMock(
            return_value=make_raw_response(
                {"members": [{"user_name": "alice"}, "unexpected-string", None]}
            )
        )

        response = await auth_client.get("/api/networks/net-1/members")

        assert response.status_code == 200
        data = response.json()
        assert data["members"] == [{"name": "alice", "role": None, "status": None}]
        assert data["partial"] is True


class TestInvites:
    """Tests for GET /api/networks/{network_id}/invites."""

    async def test_returns_invites(self, auth_client, authenticated_client):
        authenticated_client.get_invites = AsyncMock(
            return_value=make_raw_response(
                {
                    "invites": [
                        {
                            "invite_id": "inv-1",
                            "invite_url": "https://eero.com/join/secret-token",
                            "invite_role": "admin",
                            "url": "/2.2/networks/net-1/invites/inv-1",
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        body = response.json()
        # Security review, 2026-09-24: invite_url (a join credential) and
        # the raw invite_id key must never reach the client - only a
        # derived, non-secret `id` field does.
        assert "invite_url" not in body["invites"][0]
        assert "invite_id" not in body["invites"][0]
        assert body == {
            "invites": [
                {
                    "id": "inv-1",
                    "role": "admin",
                    "status": None,
                    "created": None,
                    "expires": None,
                }
            ],
            "partial": False,
        }

    async def test_access_denied_fails_soft(self, auth_client, authenticated_client):
        """403 from get_invites (some accounts) never fails the route."""
        authenticated_client.get_invites = AsyncMock(
            side_effect=EeroAccessDeniedException(403, "denied")
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        assert response.json() == {"invites": [], "partial": True}

    async def test_non_string_timestamps_coerced_not_500(
        self, auth_client, authenticated_client
    ):
        """A real invite envelope may send ``created``/``expires`` as an
        epoch timestamp (int) rather than an ISO-8601 string."""
        authenticated_client.get_invites = AsyncMock(
            return_value=make_raw_response(
                {
                    "invites": [
                        {
                            "url": "/2.2/networks/net-1/invites/inv-2",
                            "invite_role": "admin",
                            "created": 1700000000,
                            "expires": 1700003600,
                        }
                    ]
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        data = response.json()
        assert data["invites"] == [
            {
                "id": "inv-2",
                "role": "admin",
                "status": None,
                "created": "1700000000",
                "expires": "1700003600",
            }
        ]
        assert data["partial"] is False

    async def test_dict_keyed_by_id_shape_recovered(
        self, auth_client, authenticated_client
    ):
        """``get_invites`` may return a dict keyed by invite id instead
        of ``{"invites": [...]}``."""
        authenticated_client.get_invites = AsyncMock(
            return_value=make_raw_response(
                {
                    "inv-1": {
                        "url": "/2.2/networks/net-1/invites/inv-1",
                        "invite_role": "admin",
                    },
                    "inv-2": {
                        "url": "/2.2/networks/net-1/invites/inv-2",
                        "invite_role": "owner",
                    },
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        data = response.json()
        assert data["partial"] is False
        assert {i["id"] for i in data["invites"]} == {"inv-1", "inv-2"}

    async def test_non_dict_invite_entries_dropped_not_500(
        self, auth_client, authenticated_client
    ):
        """A stray non-dict entry in the invites list must be dropped,
        not raised on."""
        authenticated_client.get_invites = AsyncMock(
            return_value=make_raw_response(
                {
                    "invites": [
                        {
                            "url": "/2.2/networks/net-1/invites/inv-3",
                            "invite_role": "admin",
                        },
                        42,
                    ]
                }
            )
        )

        response = await auth_client.get("/api/networks/net-1/invites")

        assert response.status_code == 200
        data = response.json()
        assert data["invites"] == [
            {
                "id": "inv-3",
                "role": "admin",
                "status": None,
                "created": None,
                "expires": None,
            }
        ]
        assert data["partial"] is True
