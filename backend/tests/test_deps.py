"""Tests for app.deps: the EeroClient singleton and its construction.

Covers phase-6.0-revamp.md § 1.2b, § 3.1 and § 8.1: the exact constructor
kwargs (pinning ``use_keyring=False`` as an invariant, not a knob), and that
concurrent first calls to ``get_eero_client`` build exactly one client.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

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


class TestPersistedPreferredNetwork:
    """Tests for the persisted preferred-network preference (eero-ui#401).

    ``EeroClient.set_preferred_network`` is in-memory only, so a container
    restart otherwise loses the selection. ``deps.py`` persists it to a
    small JSON file next to ``settings.cookie_file`` and reapplies it the
    next time the client singleton is constructed.
    """

    async def test_new_client_applies_persisted_preference(self, tmp_path):
        """A fresh client construction picks up a persisted id without
        ever calling ``get_networks``."""
        cookie_file = str(tmp_path / "session.json")
        pref_file = tmp_path / "preferred-network.json"
        pref_file.write_text('{"network_id": "net-42"}')

        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_instance.set_preferred_network = MagicMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            client = await gen.__anext__()

            client.set_preferred_network.assert_called_once_with("net-42")
            await gen.aclose()

    async def test_new_client_with_no_persisted_file_does_not_call_set(self, tmp_path):
        """No file on disk: no call to ``set_preferred_network`` at all."""
        cookie_file = str(tmp_path / "session.json")

        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            client = await gen.__anext__()

            client.set_preferred_network.assert_not_called()
            await gen.aclose()

    async def test_corrupt_persisted_file_is_ignored(self, tmp_path):
        """Corrupt JSON is ignored, not raised."""
        cookie_file = str(tmp_path / "session.json")
        pref_file = tmp_path / "preferred-network.json"
        pref_file.write_text("not json at all")

        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            client = await gen.__anext__()

            client.set_preferred_network.assert_not_called()
            await gen.aclose()

    async def test_non_utf8_persisted_file_is_ignored(self, tmp_path):
        """Invalid UTF-8 bytes are treated as a corrupt file, not raised."""
        cookie_file = str(tmp_path / "session.json")
        pref_file = tmp_path / "preferred-network.json"
        pref_file.write_bytes(b'{"network_id": "\xff\xfe"}')

        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            client = await gen.__anext__()

            client.set_preferred_network.assert_not_called()
            await gen.aclose()

    async def test_invalid_persisted_id_is_ignored(self, tmp_path):
        """An id that fails ``validate_path_id`` (e.g. path traversal) is
        ignored rather than handed to the SDK."""
        cookie_file = str(tmp_path / "session.json")
        pref_file = tmp_path / "preferred-network.json"
        pref_file.write_text('{"network_id": "../../etc/passwd"}')

        with (
            patch.object(settings, "cookie_file", cookie_file),
            patch("app.deps.EeroClient") as mock_cls,
        ):
            mock_instance = AsyncMock()
            mock_cls.return_value = mock_instance

            gen = deps.get_eero_client()
            client = await gen.__anext__()

            client.set_preferred_network.assert_not_called()
            await gen.aclose()

    def test_save_writes_file_with_mode_0600_and_id(self, tmp_path):
        """``save_preferred_network_id`` writes the id atomically at 0600."""
        cookie_file = str(tmp_path / "session.json")
        with patch.object(settings, "cookie_file", cookie_file):
            deps.save_preferred_network_id("net-7")

            pref_file = tmp_path / "preferred-network.json"
            assert pref_file.exists()
            assert json.loads(pref_file.read_text()) == {"network_id": "net-7"}
            assert (pref_file.stat().st_mode & 0o777) == 0o600

    def test_save_overwrites_existing_file(self, tmp_path):
        """A second save replaces the first id, not appends to it."""
        cookie_file = str(tmp_path / "session.json")
        with patch.object(settings, "cookie_file", cookie_file):
            deps.save_preferred_network_id("net-1")
            deps.save_preferred_network_id("net-2")

            pref_file = tmp_path / "preferred-network.json"
            assert json.loads(pref_file.read_text()) == {"network_id": "net-2"}

    def test_clear_removes_file(self, tmp_path):
        """``clear_preferred_network_id`` removes an existing file."""
        cookie_file = str(tmp_path / "session.json")
        pref_file = tmp_path / "preferred-network.json"
        pref_file.write_text('{"network_id": "net-1"}')

        with patch.object(settings, "cookie_file", cookie_file):
            deps.clear_preferred_network_id()

        assert not pref_file.exists()

    def test_clear_is_a_noop_when_file_absent(self, tmp_path):
        """Missing file: no exception."""
        cookie_file = str(tmp_path / "session.json")
        with patch.object(settings, "cookie_file", cookie_file):
            deps.clear_preferred_network_id()  # must not raise


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
