"""Guard: app code must use only the public eero-api surface.

Reaching into the SDK's private transport (``client._api``) bypassed its
validation and was how the first live-WAN attempt (PR #456) worked before
eero-api 8.4.0 exposed ``create_burst_reporter``. Ruff's SLF001 catches the
attribute form; this regex test additionally catches the textual forms ruff
cannot see (``getattr(client, "_api")``) and fails with ``path:lineno``.
"""

import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"

PRIVATE_ATTR = re.compile(r"\._api\b")
PRIVATE_GETATTR = re.compile(r"""getattr\([^)]*["']_api["']""")


def find_violations(text: str) -> list[int]:
    """Return the 1-based line numbers that touch the SDK's private ``_api``.

    Comment-only lines are ignored.

    Args:
        text: The source text to scan.

    Returns:
        The offending line numbers, in order.
    """
    hits = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if line.lstrip().startswith("#"):
            continue
        if PRIVATE_ATTR.search(line) or PRIVATE_GETATTR.search(line):
            hits.append(lineno)
    return hits


def test_app_never_touches_the_sdk_private_api():
    """No module under ``backend/app`` reads ``._api`` or ``getattr(.., "_api")``."""
    files = sorted(APP_DIR.rglob("*.py"))
    assert files, f"no source files found under {APP_DIR}; the guard is blind"

    violations = [
        f"{path.relative_to(APP_DIR.parent)}:{lineno}"
        for path in files
        for lineno in find_violations(path.read_text(encoding="utf-8"))
    ]

    assert not violations, "private SDK access (use the public EeroClient API): " + (
        ", ".join(violations)
    )


def test_the_guard_fires_on_a_known_violation_and_spares_lookalikes():
    """Prove the regexes detect the bad forms and ignore harmless neighbours."""
    assert find_violations("token = await client._api.auth.get_auth_token()") == [1]
    assert find_violations("x = self._client._api") == [1]
    assert find_violations('api = getattr(client, "_api")') == [1]
    assert find_violations("api = getattr(client, '_api', None)") == [1]

    assert find_violations("headers['_api_key'] = key") == []
    assert find_violations("client.api.networks") == []
    assert find_violations("# client._api is private") == []
    assert find_violations("self.public_api = 1") == []
