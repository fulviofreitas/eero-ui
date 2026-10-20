"""The installed eero-api must satisfy the floor declared in pyproject.toml.

The floor moves when a feature relies on a newer SDK (8.4.1 live-verified
``create_burst_reporter``, eero-ui#458); this keeps ``uv.lock`` and the
declared range from drifting apart.
"""

import re
import tomllib
from importlib.metadata import version
from pathlib import Path

from packaging.specifiers import SpecifierSet
from packaging.version import Version

_PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


def _declared_eero_api_specifier() -> SpecifierSet:
    deps = tomllib.loads(_PYPROJECT.read_text())["project"]["dependencies"]
    (requirement,) = [d for d in deps if re.match(r"eero-api\b", d)]
    return SpecifierSet(requirement.removeprefix("eero-api"))


def test_floor_is_at_least_8_4_1():
    """The burst reporter is live-verified only from 8.4.1 on."""
    assert Version("8.4.0") not in _declared_eero_api_specifier()
    assert Version("8.4.1") in _declared_eero_api_specifier()


def test_installed_sdk_satisfies_the_declared_floor():
    """The resolved lockfile and the declared range agree."""
    assert Version(version("eero-api")) in _declared_eero_api_specifier()
