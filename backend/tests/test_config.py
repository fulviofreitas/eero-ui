"""Tests for app.config.get_settings(): environment variable overrides.

Covers phase-6.0-revamp.md § 1.2b and § 8.1: ``EERO_DASHBOARD_SDK_LEGACY_COOKIE``
and ``EERO_DASHBOARD_SDK_GET_RETRIES`` must actually reach ``Settings`` when
set, since ``get_settings()`` reads ``os.environ`` directly rather than
relying on pydantic's own env-parsing (``Settings`` is a plain ``BaseModel``,
not a ``BaseSettings``).
"""

import pytest

from app.config import get_settings


class TestSdkTuningEnvOverrides:
    """Env var overrides for the eero-api SDK tuning knobs (§ 3.1, decision 6)."""

    def test_sdk_legacy_cookie_env_var_true_takes_effect(self, monkeypatch):
        """EERO_DASHBOARD_SDK_LEGACY_COOKIE=true flips sdk_legacy_cookie to True."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_SDK_LEGACY_COOKIE", "true")

        settings = get_settings()

        assert settings.sdk_legacy_cookie is True

    def test_sdk_legacy_cookie_env_var_false_takes_effect(self, monkeypatch):
        """EERO_DASHBOARD_SDK_LEGACY_COOKIE=false keeps sdk_legacy_cookie False."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_SDK_LEGACY_COOKIE", "false")

        settings = get_settings()

        assert settings.sdk_legacy_cookie is False

    def test_sdk_legacy_cookie_defaults_to_false_when_unset(self, monkeypatch):
        """With no env var at all, the default is False."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.delenv("EERO_DASHBOARD_SDK_LEGACY_COOKIE", raising=False)

        settings = get_settings()

        assert settings.sdk_legacy_cookie is False

    def test_sdk_get_retries_env_var_takes_effect(self, monkeypatch):
        """EERO_DASHBOARD_SDK_GET_RETRIES overrides the default of 1, within
        the clamped 0-3 range (security review, 2026-09-24: an unbounded
        retry count from the environment could amplify load against the
        eero cloud API on every GET failure)."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_SDK_GET_RETRIES", "2")

        settings = get_settings()

        assert settings.sdk_get_retries == 2

    def test_sdk_get_retries_defaults_to_one_when_unset(self, monkeypatch):
        """With no env var at all, the default is 1."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.delenv("EERO_DASHBOARD_SDK_GET_RETRIES", raising=False)

        settings = get_settings()

        assert settings.sdk_get_retries == 1

    def test_sdk_get_retries_is_floored_at_zero(self, monkeypatch):
        """A negative value is clamped to 0, never a negative retry count."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_SDK_GET_RETRIES", "-3")

        settings = get_settings()

        assert settings.sdk_get_retries == 0

    def test_sdk_get_retries_is_capped_at_three(self, monkeypatch):
        """A value above 3 is clamped down to 3, never an unbounded retry
        count that could amplify load against the eero cloud API."""
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_SDK_GET_RETRIES", "999")

        settings = get_settings()

        assert settings.sdk_get_retries == 3


class TestWanLiveUsageEnv:
    """EERO_DASHBOARD_WAN_LIVE_USAGE: the second flag for live WAN bursts."""

    def test_defaults_to_false(self, monkeypatch):
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.delenv("EERO_DASHBOARD_WAN_LIVE_USAGE", raising=False)

        assert get_settings().wan_live_usage is False

    @pytest.mark.parametrize("value", ["true", "TRUE", "True"])
    def test_true_enables_it(self, monkeypatch, value):
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_WAN_LIVE_USAGE", value)

        assert get_settings().wan_live_usage is True

    @pytest.mark.parametrize("value", ["false", "1", "yes", ""])
    def test_anything_else_stays_off(self, monkeypatch, value):
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_WAN_LIVE_USAGE", value)

        assert get_settings().wan_live_usage is False

    def test_experimental_writes_alone_does_not_enable_it(self, monkeypatch):
        monkeypatch.setenv("EERO_DASHBOARD_SESSION_SECRET", "x" * 32)
        monkeypatch.setenv("EERO_DASHBOARD_EXPERIMENTAL_WRITES", "true")
        monkeypatch.delenv("EERO_DASHBOARD_WAN_LIVE_USAGE", raising=False)

        settings = get_settings()

        assert settings.experimental_writes is True
        assert settings.wan_live_usage is False
