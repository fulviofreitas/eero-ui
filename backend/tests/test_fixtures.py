"""Self-tests for the shared test fixtures in conftest.py.

Covers phase-6.0-revamp.md § 8.1: proves that ``mock_eero_client`` and
``authenticated_client`` are genuinely ``create_autospec(EeroClient,
instance=True)`` mocks, not bare ``MagicMock()`` instances. Before this
change, calling a renamed or removed SDK method on the mock silently
returned a non-awaitable ``MagicMock`` instead of failing the test.
"""

import pytest


class TestMockEeroClientIsAutospecced:
    """``mock_eero_client`` must reject calls to methods EeroClient does
    not have."""

    def test_nonexistent_method_raises_attribute_error(self, mock_eero_client):
        """A method that does not exist on EeroClient is not on the mock."""
        with pytest.raises(AttributeError):
            mock_eero_client.this_method_does_not_exist_on_eero_client()

    def test_nonexistent_attribute_raises_attribute_error(self, mock_eero_client):
        """A non-callable attribute that does not exist is also rejected."""
        with pytest.raises(AttributeError):
            _ = mock_eero_client.totally_made_up_attribute


class TestAuthenticatedClientIsAutospecced:
    """``authenticated_client`` builds on the same autospec'd mock."""

    def test_nonexistent_method_raises_attribute_error(self, authenticated_client):
        """The authenticated fixture is not a fresh, unspecced mock."""
        with pytest.raises(AttributeError):
            authenticated_client.this_method_does_not_exist_on_eero_client()

    def test_real_methods_are_still_callable(self, authenticated_client):
        """Sanity check: genuine EeroClient methods remain present."""
        # These must exist on the real SDK; accessing them must not raise.
        assert callable(authenticated_client.get_networks)
        assert callable(authenticated_client.get_devices)
        assert callable(authenticated_client.block_device)
