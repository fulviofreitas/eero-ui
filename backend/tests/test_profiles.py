"""Tests for profile routes."""

from unittest.mock import AsyncMock

from eero.exceptions import EeroException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


sample_profile = {
    "url": "/2.2/networks/abc/profiles/profile-1",
    "name": "Kids",
    "paused": False,
    "devices": [],
}


class TestListProfiles:
    """Tests for GET /api/profiles."""

    async def test_list_profiles_success(self, auth_client, authenticated_client):
        """Returns list of profiles."""
        authenticated_client.get_profiles = AsyncMock(
            return_value=make_raw_response([sample_profile])
        )

        response = await auth_client.get("/api/profiles")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == "Kids"

    async def test_list_profiles_eero_exception(
        self, auth_client, authenticated_client
    ):
        """EeroException returns 500."""
        authenticated_client.get_profiles = AsyncMock(
            side_effect=EeroException("API error")
        )

        response = await auth_client.get("/api/profiles")

        assert response.status_code == 500


class TestGetProfile:
    """Tests for GET /api/profiles/{profile_id}."""

    async def test_get_profile_success(self, auth_client, authenticated_client):
        """Returns profile details."""
        authenticated_client.get_profile = AsyncMock(
            return_value=make_raw_response(sample_profile)
        )

        response = await auth_client.get("/api/profiles/profile-1")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Kids"

    async def test_get_profile_eero_exception(self, auth_client, authenticated_client):
        """EeroException returns 404."""
        authenticated_client.get_profile = AsyncMock(
            side_effect=EeroException("not found")
        )

        response = await auth_client.get("/api/profiles/profile-1")

        assert response.status_code == 404


class TestCreateProfile:
    """Tests for POST /api/profiles."""

    async def test_create_profile_success(self, auth_client, authenticated_client):
        """Creates a profile and returns 201 with ProfileSummary."""
        authenticated_client.create_profile = AsyncMock(
            return_value=make_raw_response(sample_profile)
        )

        response = await auth_client.post("/api/profiles", json={"name": "Kids"})

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Kids"
        authenticated_client.create_profile.assert_called_once()

    async def test_create_profile_empty_name(self, auth_client, authenticated_client):
        """Empty name returns 400 without calling SDK."""
        authenticated_client.create_profile = AsyncMock()

        response = await auth_client.post("/api/profiles", json={"name": "   "})

        assert response.status_code == 400
        authenticated_client.create_profile.assert_not_called()

    async def test_create_profile_eero_exception(
        self, auth_client, authenticated_client
    ):
        """EeroException returns 500."""
        authenticated_client.create_profile = AsyncMock(
            side_effect=EeroException("create failed")
        )

        response = await auth_client.post("/api/profiles", json={"name": "Kids"})

        assert response.status_code == 500


class TestRenameProfile:
    """Tests for PATCH /api/profiles/{profile_id}."""

    async def test_rename_profile_success(self, auth_client, authenticated_client):
        """Renames a profile and returns updated ProfileSummary."""
        renamed_profile = {**sample_profile, "name": "Teens"}
        authenticated_client.rename_profile = AsyncMock(
            return_value=make_raw_response(renamed_profile)
        )

        response = await auth_client.patch(
            "/api/profiles/profile-1", json={"name": "Teens"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Teens"
        authenticated_client.rename_profile.assert_called_once()

    async def test_rename_profile_empty_name(self, auth_client, authenticated_client):
        """Empty name returns 400 without calling SDK."""
        authenticated_client.rename_profile = AsyncMock()

        response = await auth_client.patch(
            "/api/profiles/profile-1", json={"name": "   "}
        )

        assert response.status_code == 400
        authenticated_client.rename_profile.assert_not_called()

    async def test_rename_profile_eero_exception(
        self, auth_client, authenticated_client
    ):
        """EeroException returns 404."""
        authenticated_client.rename_profile = AsyncMock(
            side_effect=EeroException("not found")
        )

        response = await auth_client.patch(
            "/api/profiles/profile-1", json={"name": "Teens"}
        )

        assert response.status_code == 404


class TestDeleteProfile:
    """Tests for DELETE /api/profiles/{profile_id}."""

    async def test_delete_profile_success(self, auth_client, authenticated_client):
        """Deletes a profile and returns ProfileAction with success=True."""
        authenticated_client.delete_profile = AsyncMock(
            return_value=make_raw_response({}, code=200)
        )

        response = await auth_client.delete("/api/profiles/profile-1")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["action"] == "delete"
        authenticated_client.delete_profile.assert_called_once()

    async def test_delete_profile_eero_exception(
        self, auth_client, authenticated_client
    ):
        """EeroException returns 500."""
        authenticated_client.delete_profile = AsyncMock(
            side_effect=EeroException("delete failed")
        )

        response = await auth_client.delete("/api/profiles/profile-1")

        assert response.status_code == 500


class TestPauseProfile:
    """Tests for POST /api/profiles/{profile_id}/pause."""

    async def test_pause_profile_success(self, auth_client, authenticated_client):
        """Pauses a profile and returns ProfileAction."""
        authenticated_client.pause_profile = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/profiles/profile-1/pause")

        assert response.status_code == 200
        data = response.json()
        assert data["action"] == "pause"


class TestUnpauseProfile:
    """Tests for POST /api/profiles/{profile_id}/unpause."""

    async def test_unpause_profile_success(self, auth_client, authenticated_client):
        """Unpauses a profile and returns ProfileAction."""
        authenticated_client.pause_profile = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post("/api/profiles/profile-1/unpause")

        assert response.status_code == 200
        data = response.json()
        assert data["action"] == "unpause"
