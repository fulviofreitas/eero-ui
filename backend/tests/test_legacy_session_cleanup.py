"""Tests for the one-shot legacy exporter-session cleanup on startup.

Volumes upgraded from eero-ui 5.x may still carry a full copy of the eero
session token in ``exporter-session.json`` next to the main cookie file --
the now-deleted exporter-sync code was the only thing that ever removed it.
``app.main._remove_legacy_exporter_session_file`` cleans this up once on
startup; these tests exercise that function directly.
"""

import logging

from app.main import _remove_legacy_exporter_session_file


class TestLegacyExporterSessionCleanup:
    """Tests for _remove_legacy_exporter_session_file."""

    def test_removes_legacy_file_when_present(self, tmp_path, monkeypatch, caplog):
        """A sibling exporter-session.json next to the cookie file is removed."""
        from app.main import settings

        cookie_file = tmp_path / "session.json"
        cookie_file.write_text("{}")
        legacy_file = tmp_path / "exporter-session.json"
        legacy_file.write_text('{"token": "super-secret-session-token"}')

        monkeypatch.setattr(settings, "cookie_file", str(cookie_file))

        with caplog.at_level(logging.INFO):
            _remove_legacy_exporter_session_file()

        assert not legacy_file.exists()
        # The log line names the action, never the file's path or contents.
        info_messages = [r.message for r in caplog.records if r.levelno == logging.INFO]
        assert any("Removed legacy exporter session file" in m for m in info_messages)
        for message in info_messages:
            assert "super-secret-session-token" not in message
            assert str(legacy_file) not in message

    def test_no_op_when_legacy_file_absent(self, tmp_path, monkeypatch, caplog):
        """Nothing happens, and nothing is logged, when there is no legacy file."""
        from app.main import settings

        cookie_file = tmp_path / "session.json"
        cookie_file.write_text("{}")

        monkeypatch.setattr(settings, "cookie_file", str(cookie_file))

        with caplog.at_level(logging.INFO):
            _remove_legacy_exporter_session_file()

        assert not (tmp_path / "exporter-session.json").exists()
        info_messages = [r.message for r in caplog.records if r.levelno == logging.INFO]
        assert not any(
            "Removed legacy exporter session file" in m for m in info_messages
        )

    def test_oserror_is_swallowed_with_warning(self, tmp_path, monkeypatch, caplog):
        """An OSError on unlink is swallowed and logged as a WARNING, not raised."""
        from app.main import settings

        cookie_file = tmp_path / "session.json"
        cookie_file.write_text("{}")
        legacy_file = tmp_path / "exporter-session.json"
        legacy_file.write_text("{}")

        monkeypatch.setattr(settings, "cookie_file", str(cookie_file))

        def _raise_oserror(self):
            raise OSError("permission denied")

        monkeypatch.setattr(type(legacy_file), "unlink", _raise_oserror)

        with caplog.at_level(logging.WARNING):
            _remove_legacy_exporter_session_file()  # must not raise

        warning_messages = [
            r.message for r in caplog.records if r.levelno == logging.WARNING
        ]
        assert any(
            "Failed to remove legacy exporter session file" in m
            for m in warning_messages
        )
