"""Tests for eero node routes.

Covers the eero list and detail endpoints, with particular focus on the
issue #193 regression: the detail endpoint must not return HTTP 500 when
the Eero Cloud API returns fields in unexpected shapes.
"""

from unittest.mock import AsyncMock

from eero.exceptions import EeroException


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


# A well-formed single-eero payload as returned by the Eero Cloud API.
sample_eero = {
    "url": "/2.2/eeros/eero-1",
    "serial": "SN-EERO-1",
    "mac_address": "AA:BB:CC:DD:EE:FF",
    "model": "eero Pro 6E",
    "model_number": "R010001",
    "status": "green",
    "location": "Office",
    "gateway": True,
    "os_version": "7.4.0",
    "ip_address": "192.168.4.1",
    "connected_clients_count": 12,
    "led_on": True,
    "update_available": False,
    "last_reboot": "2026-05-01T08:30:00.000Z",
}


class TestListEeros:
    """Tests for GET /api/eeros."""

    async def test_list_eeros_success(self, auth_client, authenticated_client):
        """Returns the list of eero nodes."""
        authenticated_client.get_eeros = AsyncMock(
            return_value=make_raw_response([sample_eero])
        )

        response = await auth_client.get("/api/eeros")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "eero-1"
        assert data[0]["model"] == "eero Pro 6E"

    async def test_list_eeros_empty(self, auth_client, authenticated_client):
        """Returns an empty list when there are no eeros."""
        authenticated_client.get_eeros = AsyncMock(return_value=make_raw_response([]))

        response = await auth_client.get("/api/eeros")

        assert response.status_code == 200
        assert response.json() == []

    async def test_list_eeros_tolerates_malformed_entry(
        self, auth_client, authenticated_client
    ):
        """A single malformed eero must not blank the whole list."""
        malformed = {"url": "/2.2/eeros/eero-2", "status": {"deeply": {"nested": 1}}}
        authenticated_client.get_eeros = AsyncMock(
            return_value=make_raw_response([sample_eero, malformed])
        )

        response = await auth_client.get("/api/eeros")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2


class TestGetEero:
    """Tests for GET /api/eeros/{eero_id}."""

    async def test_get_eero_success(self, auth_client, authenticated_client):
        """Returns full eero detail for a well-formed response."""
        authenticated_client.get_eero = AsyncMock(
            return_value=make_raw_response(sample_eero)
        )

        response = await auth_client.get("/api/eeros/eero-1")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "eero-1"
        assert data["status"] == "green"
        assert data["is_gateway"] is True
        assert data["connected_clients_count"] == 12

    async def test_get_eero_nested_status_dict(self, auth_client, authenticated_client):
        """Detail endpoint handles a nested status object without a 500."""
        raw = {**sample_eero, "status": {"status": "green"}}
        authenticated_client.get_eero = AsyncMock(return_value=make_raw_response(raw))

        response = await auth_client.get("/api/eeros/eero-1")

        assert response.status_code == 200
        assert response.json()["status"] == "green"

    async def test_get_eero_dict_shaped_numeric_fields(
        self, auth_client, authenticated_client
    ):
        """Detail endpoint coerces dict-shaped numeric fields without a 500."""
        raw = {
            **sample_eero,
            "connected_clients_count": {"count": 7},
            "mesh_quality_bars": {"value": 3},
        }
        authenticated_client.get_eero = AsyncMock(return_value=make_raw_response(raw))

        response = await auth_client.get("/api/eeros/eero-1")

        assert response.status_code == 200
        data = response.json()
        assert data["connected_clients_count"] == 7
        assert data["mesh_quality_bars"] == 3

    async def test_get_eero_object_shaped_update_available(
        self, auth_client, authenticated_client
    ):
        """Detail endpoint coerces an object-shaped update_available."""
        raw = {**sample_eero, "update_available": {"min_required_firmware": "7.5"}}
        authenticated_client.get_eero = AsyncMock(return_value=make_raw_response(raw))

        response = await auth_client.get("/api/eeros/eero-1")

        assert response.status_code == 200
        assert response.json()["update_available"] is True

    async def test_get_eero_malformed_response_degrades_gracefully(
        self, auth_client, authenticated_client
    ):
        """A wholly unexpected response degrades to 200 instead of a 500."""
        raw = {
            "url": "/2.2/eeros/eero-1",
            "serial": "SN-EERO-1",
            "model": "eero",
            "status": {"value": {"unexpected": "shape"}},
            "bands": [{"band": "2.4"}],
            "bssids_with_bands": ["not-a-dict"],
        }
        authenticated_client.get_eero = AsyncMock(return_value=make_raw_response(raw))

        response = await auth_client.get("/api/eeros/eero-1")

        assert response.status_code == 200
        data = response.json()
        assert data["serial"] == "SN-EERO-1"

    async def test_get_eero_not_found(self, auth_client, authenticated_client):
        """An SDK error maps to a 404 response."""
        authenticated_client.get_eero = AsyncMock(
            side_effect=EeroException("not found")
        )

        response = await auth_client.get("/api/eeros/missing")

        assert response.status_code == 404

    async def test_get_eero_requires_auth(self, async_client, mock_eero_client):
        """Unauthenticated requests are rejected."""
        mock_eero_client.is_authenticated = False

        response = await async_client.get("/api/eeros/eero-1")

        assert response.status_code == 401
