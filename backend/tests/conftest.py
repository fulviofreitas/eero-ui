"""Shared test fixtures for backend tests.

This module provides reusable fixtures for testing FastAPI routes
with a mocked EeroClient dependency.

As of eero-api v2.0.0, all client methods return raw JSON responses
in the format {"meta": {...}, "data": {...}}.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.deps import get_eero_client
from app.main import app


def make_raw_response(data, code: int = 200):
    """Helper to create a raw API response envelope."""
    return {"meta": {"code": code}, "data": data}


@pytest.fixture
def mock_eero_client():
    """Create a mock EeroClient for unit tests.

    Mock at the external boundary - the eero-api SDK.
    This is the right place to mock since eero-api
    is our external dependency.

    As of v2.0.0, all methods return raw JSON responses.
    """
    client = MagicMock()
    client.is_authenticated = False
    client.preferred_network_id = None

    # Async methods - all return raw responses
    client.login = AsyncMock(return_value=make_raw_response({}))
    client.verify = AsyncMock(return_value=make_raw_response({}))
    client.logout = AsyncMock(return_value=make_raw_response({}))
    client.get_account = AsyncMock(return_value=make_raw_response({}))
    client.get_networks = AsyncMock(
        return_value=make_raw_response({"networks": {"count": 0, "data": []}})
    )
    client.get_devices = AsyncMock(
        return_value=make_raw_response({"devices": {"count": 0, "data": []}})
    )
    client.get_eeros = AsyncMock(
        return_value=make_raw_response({"eeros": {"count": 0, "data": []}})
    )
    client.get_profiles = AsyncMock(
        return_value=make_raw_response({"profiles": {"count": 0, "data": []}})
    )

    return client


@pytest.fixture
def authenticated_client(mock_eero_client):
    """Mock client in authenticated state."""
    mock_eero_client.is_authenticated = True
    mock_eero_client.preferred_network_id = "network-123"
    return mock_eero_client


@pytest.fixture
async def async_client(mock_eero_client):
    """Async HTTP test client with mocked EeroClient.

    Uses httpx.AsyncClient for testing async FastAPI endpoints.
    """

    async def override_get_eero_client():
        yield mock_eero_client

    app.dependency_overrides[get_eero_client] = override_get_eero_client

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(authenticated_client):
    """Async test client with authenticated EeroClient."""

    async def override_get_eero_client():
        yield authenticated_client

    app.dependency_overrides[get_eero_client] = override_get_eero_client

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
