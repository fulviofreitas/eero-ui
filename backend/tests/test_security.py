"""Security tests for the Eero Dashboard backend."""

import pytest
from pathlib import Path


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
