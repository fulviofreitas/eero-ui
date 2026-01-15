"""Shared test fixtures for backend tests.

This module provides reusable fixtures for testing FastAPI routes
with a mocked EeroClient dependency.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.deps import get_eero_client


@pytest.fixture
def mock_eero_client():
    """Create a mock EeroClient for unit tests.

    Mock at the external boundary - the eero-client SDK.
    This is the right place to mock since eero-client
    is our external dependency.
    """
    client = MagicMock()
    client.is_authenticated = False
    client.preferred_network_id = None

    # Async methods
    client.login = AsyncMock(return_value=True)
    client.verify = AsyncMock(return_value=True)
    client.logout = AsyncMock(return_value=True)
    client.get_account = AsyncMock()
    client.get_networks = AsyncMock(return_value=[])
    client.get_devices = AsyncMock(return_value=[])
    client.get_eeros = AsyncMock(return_value=[])
    client.get_profiles = AsyncMock(return_value=[])

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
