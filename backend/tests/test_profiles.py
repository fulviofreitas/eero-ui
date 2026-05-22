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


# ---------------------------------------------------------------------------
# Helpers for assign-devices tests
# ---------------------------------------------------------------------------


def _make_device(dev_id: str, network_id: str = "network-123") -> dict:
    """Build a raw device dict matching the eero API envelope shape."""
    return {
        "url": f"/2.2/networks/{network_id}/devices/{dev_id}",
        "mac": f"aa:bb:cc:dd:ee:{dev_id[-2:]}",
        "nickname": f"Device {dev_id}",
        "connected": True,
        "wireless": True,
    }


def _make_profile_with_devices(
    profile_id: str,
    network_id: str,
    existing_device_ids: list[str],
) -> dict:
    """Build a raw profile data dict (the 'data' field of the envelope)."""
    return {
        "url": f"/2.2/networks/{network_id}/profiles/{profile_id}",
        "name": "Kids",
        "paused": False,
        "devices": [
            {"url": f"/2.2/networks/{network_id}/devices/{d}"}
            for d in existing_device_ids
        ],
    }


class TestAssignDevicesToProfile:
    """Tests for POST /api/profiles/{profile_id}/assign-devices."""

    async def test_three_devices_single_sdk_call_with_merge(
        self, auth_client, authenticated_client
    ):
        """Assigning 3 devices results in exactly ONE set_profile_devices call
        that contains all 3 new URLs merged with any pre-existing device URLs."""
        network_id = "network-123"
        profile_id = "profile-1"

        # Network has 4 devices; profile already owns device-0
        raw_devices = [_make_device(f"device-{i}", network_id) for i in range(4)]
        authenticated_client.get_devices = AsyncMock(
            return_value=make_raw_response(raw_devices)
        )

        authenticated_client.get_profile_devices = AsyncMock(
            return_value=make_raw_response(
                _make_profile_with_devices(profile_id, network_id, ["device-0"])
            )
        )

        authenticated_client.set_profile_devices = AsyncMock(
            return_value=make_raw_response({})
        )

        # Assign devices 1, 2, 3 (device-0 already there, should be preserved)
        response = await auth_client.post(
            f"/api/profiles/{profile_id}/assign-devices",
            json={"device_ids": ["device-1", "device-2", "device-3"]},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["profile_id"] == profile_id
        assert data["assigned_count"] == 3

        # Must be called exactly once
        authenticated_client.set_profile_devices.assert_called_once()

        # The URL list passed must contain all 4 device URLs (merge of old + new)
        call_args = authenticated_client.set_profile_devices.call_args
        # Positional: (profile_id, device_urls, network_id)
        passed_urls: list[str] = call_args.args[1]
        expected_urls = {
            f"/2.2/networks/{network_id}/devices/device-{i}" for i in range(4)
        }
        assert set(passed_urls) == expected_urls

    async def test_empty_device_ids_returns_200_with_count_zero(
        self, auth_client, authenticated_client
    ):
        """Empty device_ids list is a no-op: count 0, existing devices preserved."""
        network_id = "network-123"
        profile_id = "profile-1"

        authenticated_client.get_devices = AsyncMock(
            return_value=make_raw_response([_make_device("device-0", network_id)])
        )

        authenticated_client.get_profile_devices = AsyncMock(
            return_value=make_raw_response(
                _make_profile_with_devices(profile_id, network_id, ["device-0"])
            )
        )

        authenticated_client.set_profile_devices = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.post(
            f"/api/profiles/{profile_id}/assign-devices",
            json={"device_ids": []},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["assigned_count"] == 0

        # set_profile_devices still called once (preserving existing devices)
        authenticated_client.set_profile_devices.assert_called_once()
        passed_urls = authenticated_client.set_profile_devices.call_args.args[1]
        # Existing device-0 must still be in the list
        existing_url = f"/2.2/networks/{network_id}/devices/device-0"
        assert existing_url in passed_urls

    async def test_eero_exception_on_get_devices_returns_500(
        self, auth_client, authenticated_client
    ):
        """EeroException during get_devices propagates as HTTP 500."""
        authenticated_client.get_devices = AsyncMock(
            side_effect=EeroException("network error")
        )
        authenticated_client.set_profile_devices = AsyncMock()

        response = await auth_client.post(
            "/api/profiles/profile-1/assign-devices",
            json={"device_ids": ["device-1"]},
        )

        assert response.status_code == 500
        authenticated_client.set_profile_devices.assert_not_called()

    async def test_eero_exception_on_set_profile_devices_returns_500(
        self, auth_client, authenticated_client
    ):
        """EeroException from set_profile_devices propagates as HTTP 500."""
        network_id = "network-123"
        profile_id = "profile-1"

        authenticated_client.get_devices = AsyncMock(
            return_value=make_raw_response([_make_device("device-1", network_id)])
        )
        authenticated_client.get_profile_devices = AsyncMock(
            return_value=make_raw_response(
                _make_profile_with_devices(profile_id, network_id, [])
            )
        )
        authenticated_client.set_profile_devices = AsyncMock(
            side_effect=EeroException("write error")
        )

        response = await auth_client.post(
            f"/api/profiles/{profile_id}/assign-devices",
            json={"device_ids": ["device-1"]},
        )

        assert response.status_code == 500

    async def test_missing_device_id_skipped_gracefully(
        self, auth_client, authenticated_client
    ):
        """Device IDs not found in the network are silently skipped."""
        network_id = "network-123"
        profile_id = "profile-1"

        authenticated_client.get_devices = AsyncMock(
            return_value=make_raw_response([_make_device("device-1", network_id)])
        )
        authenticated_client.get_profile_devices = AsyncMock(
            return_value=make_raw_response(
                _make_profile_with_devices(profile_id, network_id, [])
            )
        )
        authenticated_client.set_profile_devices = AsyncMock(
            return_value=make_raw_response({})
        )

        # "ghost-device" does not exist in the network
        response = await auth_client.post(
            f"/api/profiles/{profile_id}/assign-devices",
            json={"device_ids": ["device-1", "ghost-device"]},
        )

        assert response.status_code == 200
        data = response.json()
        # Only 1 device could be resolved
        assert data["assigned_count"] == 1
        passed_urls = authenticated_client.set_profile_devices.call_args.args[1]
        assert f"/2.2/networks/{network_id}/devices/device-1" in passed_urls
        # ghost-device URL must not appear
        assert not any("ghost-device" in u for u in passed_urls)

    async def test_missing_body_returns_422(self, auth_client, authenticated_client):
        """Missing request body returns 422 validation error."""
        response = await auth_client.post(
            "/api/profiles/profile-1/assign-devices",
            content=b"",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422
