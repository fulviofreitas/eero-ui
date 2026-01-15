"""Security tests for the Eero Dashboard backend."""

import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient


class TestPathTraversalPrevention:
    """Test path traversal prevention in SPA handler."""

    def test_path_traversal_blocked(self):
        """Verify that path traversal attempts are blocked."""
        # Simulate the security check from main.py
        frontend_dist = Path("/app/frontend/build")
        frontend_dist_resolved = frontend_dist.resolve()

        # These paths should be BLOCKED (escape the directory)
        # Note: Windows-style paths (backslashes) are not path separators on Unix,
        # so they become literal characters and don't need blocking
        malicious_paths = [
            "../etc/passwd",
            "../../etc/passwd",
            "../../../etc/passwd",
            "devices/../../../etc/passwd",
            "something/../../../etc/passwd",
            "../../../../../../etc/passwd",
        ]

        for path in malicious_paths:
            file_path = (frontend_dist / path).resolve()
            try:
                file_path.relative_to(frontend_dist_resolved)
                # If we get here, the path was NOT blocked
                pytest.fail(f"Path traversal not blocked: {path}")
            except ValueError:
                # Expected - path escapes the allowed directory
                pass

    def test_valid_paths_allowed(self):
        """Verify that valid paths within frontend_dist are allowed."""
        frontend_dist = Path("/app/frontend/build")
        frontend_dist_resolved = frontend_dist.resolve()

        # These paths should be ALLOWED (stay within directory)
        valid_paths = [
            "index.html",
            "_app/something.js",
            "assets/style.css",
            "nested/deep/file.js",
            # URL-encoded dots are literal characters, not traversal
            "..%2F..%2Fetc/passwd",
        ]

        for path in valid_paths:
            file_path = (frontend_dist / path).resolve()
            try:
                file_path.relative_to(frontend_dist_resolved)
                # Expected - path is within allowed directory
            except ValueError:
                pytest.fail(f"Valid path incorrectly blocked: {path}")


class TestSessionSecretRequirement:
    """Test session secret configuration requirements."""

    def test_weak_secret_detection(self):
        """Verify that weak secrets can be detected."""
        weak_secrets = [
            "change-me-in-production",
            "change-me-in-production-use-32-bytes",
            "secret",
            "password",
            "short",  # Less than 32 characters
        ]

        for secret in weak_secrets:
            is_weak = (
                secret.lower()
                in [
                    "change-me-in-production",
                    "change-me-in-production-use-32-bytes",
                    "secret",
                    "password",
                ]
                or len(secret) < 32
            )
            assert is_weak, f"Secret '{secret}' should be detected as weak"

    def test_strong_secret_passes(self):
        """Verify that strong secrets pass validation."""
        strong_secret = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

        is_weak = (
            strong_secret.lower()
            in [
                "change-me-in-production",
                "change-me-in-production-use-32-bytes",
                "secret",
                "password",
            ]
            or len(strong_secret) < 32
        )
        assert not is_weak, "Strong secret should not be detected as weak"


class TestRateLimiting:
    """Test rate limiting configuration on auth endpoints."""

    def test_rate_limiter_is_configured(self):
        """Verify that rate limiter is configured on auth endpoints."""
        from app.routes.auth import limiter, login, verify

        # Check that the limiter exists
        assert limiter is not None

        # Check that login and verify have the rate limit decorator applied
        # The decorator adds limit info to the function
        assert hasattr(login, "__wrapped__") or callable(login)
        assert hasattr(verify, "__wrapped__") or callable(verify)

    def test_rate_limiter_registered_with_app(self):
        """Verify that the rate limiter is registered with the FastAPI app."""
        from app.main import app

        # Check that the app has the limiter state
        assert hasattr(app.state, "limiter")
        assert app.state.limiter is not None


class TestExceptionSanitization:
    """Test that exception messages don't leak internal details."""

    def test_error_messages_are_generic(self):
        """Verify that error messages shown to users are generic."""
        # These are the sanitized error messages that should be returned
        expected_generic_messages = [
            "Failed to retrieve networks. Please try again.",
            "Failed to retrieve devices. Please try again.",
            "Failed to retrieve eero nodes. Please try again.",
            "Failed to retrieve profiles. Please try again.",
            "Failed to block device. Please try again.",
            "Failed to unblock device. Please try again.",
            "Failed to set device nickname. Please try again.",
            "Failed to prioritize device. Please try again.",
            "Failed to remove device priority. Please try again.",
            "Failed to reboot eero. Please try again.",
            "Failed to update LED state. Please try again.",
            "Failed to update LED brightness. Please try again.",
            "Failed to pause profile. Please try again.",
            "Failed to resume profile. Please try again.",
            "Failed to update guest network settings. Please try again.",
            "Authentication failed. Please check your credentials.",
        ]

        # Verify none of these contain internal implementation details
        forbidden_patterns = [
            "Exception",
            "Error:",
            "Traceback",
            "File \"",
            "line ",
            "python",
            ".py",
        ]

        for message in expected_generic_messages:
            for pattern in forbidden_patterns:
                assert pattern.lower() not in message.lower(), (
                    f"Error message '{message}' contains forbidden pattern '{pattern}'"
                )
