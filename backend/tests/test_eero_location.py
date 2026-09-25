"""Tests for PUT /api/eeros/{eero_id}/location (WP7 follow-up (c),
coordinator directive 2026-09-24).

Unverified write (phase-6.0-revamp.md § 5; sdk-surface-map-v8.0.3.md WP7:
``set_location``'s own SDK docstring prescribes a read-compare-skip
discipline) - gated behind ``require_experimental_writes``, rate limited
in the shared ``experimental_writes`` scope.
"""

from unittest.mock import AsyncMock


def make_raw_response(data, code: int = 200):
    return {"meta": {"code": code}, "data": data}


class TestSetEeroLocation:
    async def test_disabled_by_default_returns_403(
        self, auth_client, authenticated_client
    ):
        authenticated_client.set_location = AsyncMock()

        response = await auth_client.put(
            "/api/eeros/eero-1/location", json={"location": "Office"}
        )

        assert response.status_code == 403
        assert response.json()["type"] == "experimental_disabled"
        authenticated_client.set_location.assert_not_called()

    async def test_changes_location_and_reads_back(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_eero = AsyncMock(
            side_effect=[
                make_raw_response(
                    {"url": "/2.2/eeros/eero-1", "location": "Living Room"}
                ),
                make_raw_response({"url": "/2.2/eeros/eero-1", "location": "Office"}),
            ]
        )
        authenticated_client.set_location = AsyncMock(
            return_value=make_raw_response({})
        )

        response = await auth_client.put(
            "/api/eeros/eero-1/location", json={"location": "Office"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["changed"] is True
        assert data["location"] == "Office"
        authenticated_client.set_location.assert_called_once_with(
            "eero-1", "Office", network_id="network-123"
        )

    async def test_no_op_when_unchanged(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_eero = AsyncMock(
            return_value=make_raw_response(
                {"url": "/2.2/eeros/eero-1", "location": "Office"}
            )
        )
        authenticated_client.set_location = AsyncMock()

        response = await auth_client.put(
            "/api/eeros/eero-1/location", json={"location": "  Office  "}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is False
        assert data["location"] == "Office"
        authenticated_client.set_location.assert_not_called()

    async def test_empty_location_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.get_eero = AsyncMock()
        authenticated_client.set_location = AsyncMock()

        response = await auth_client.put(
            "/api/eeros/eero-1/location", json={"location": "   "}
        )

        assert response.status_code == 422
        authenticated_client.get_eero.assert_not_called()
        authenticated_client.set_location.assert_not_called()

    async def test_oversized_location_rejected(
        self, auth_client, authenticated_client, experimental_writes_enabled
    ):
        authenticated_client.set_location = AsyncMock()

        response = await auth_client.put(
            "/api/eeros/eero-1/location", json={"location": "x" * 33}
        )

        assert response.status_code == 422
        authenticated_client.set_location.assert_not_called()
