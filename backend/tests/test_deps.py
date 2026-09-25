"""Tests for app.deps: the EeroClient singleton and its construction.

Covers phase-6.0-revamp.md § 1.2b, § 3.1 and § 8.1: the exact constructor
kwargs (pinning ``use_keyring=False`` as an invariant, not a knob), and that
concurrent first calls to ``get_eero_client`` build exactly one client.
"""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app import deps
from app.config import settings


@pytest.fixture(autouse=True)
def _reset_client_singleton():
    """Ensure each test starts with no cached EeroClient."""
    deps._client = None
    yield
    deps._client = None


class TestClientConstruction:
    """Tests for get_eero_client's construction of the singleton."""

    async def test_constructor_kwargs_are_exact(self, tmp_path):
        """The client is built with the exact pinned/configured kwargs."""
        cookie_file = str(tmp_path / "session.json")
        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch.object(settings, "sdk_legacy_cookie", False),
            patch.object(settings, "sdk_get_retries", 1),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            client = await gen.__anext__()

            mock_cls.assert_called_once_with(
                cookie_file=cookie_file,
                use_keyring=False,
                cache_timeout=60,
                send_legacy_cookie=False,
                get_retries=1,
            )
            assert client is mock_instance
            mock_instance.__aenter__.assert_awaited_once()

            await gen.aclose()

    async def test_send_legacy_cookie_and_get_retries_follow_settings(self, tmp_path):
        """Non-default settings values are passed straight through."""
        cookie_file = str(tmp_path / "session.json")
        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch.object(settings, "sdk_legacy_cookie", True),
            patch.object(settings, "sdk_get_retries", 3),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            await gen.__anext__()

            mock_cls.assert_called_once_with(
                cookie_file=cookie_file,
                use_keyring=False,
                cache_timeout=60,
                send_legacy_cookie=True,
                get_retries=3,
            )
            await gen.aclose()

    async def test_concurrent_first_calls_build_one_client(self, tmp_path):
        """Two concurrent first calls to get_eero_client build only one client."""
        cookie_file = str(tmp_path / "session.json")
        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            async def _get_once():
                gen = deps.get_eero_client()
                client = await gen.__anext__()
                return gen, client

            (gen_a, client_a), (gen_b, client_b) = await asyncio.gather(
                _get_once(), _get_once()
            )

            assert client_a is client_b
            mock_cls.assert_called_once()
            await gen_a.aclose()
            await gen_b.aclose()


class TestRequireExperimentalWrites:
    """Tests for the decision-6a experimental-writes gate."""

    async def test_disabled_by_default_raises_experimental_write_disabled(self):
        """Disabled (the default) raises the dedicated exception, mapped to
        403 experimental_disabled by the handler in main.py."""
        with (
            patch.object(settings, "experimental_writes", False),
            pytest.raises(deps.ExperimentalWriteDisabledError),
        ):
            await deps.require_experimental_writes()

    async def test_enabled_allows_through(self):
        """Enabled raises nothing."""
        with patch.object(settings, "experimental_writes", True):
            result = await deps.require_experimental_writes()
        assert result is None
