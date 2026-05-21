"""Numeric coercion helpers for raw Eero Cloud API responses.

The Eero Cloud API occasionally changes numeric fields to structured dict
shapes (e.g. uptime: 1000 becomes uptime: {"seconds": 1000, "human": "16m"}).
This module provides safe coercion so callers always receive a float/int or None.
"""

import logging
from typing import Any

_LOGGER = logging.getLogger(__name__)

# Tracks (field_name, frozenset_of_keys) pairs already logged so we only
# emit each unknown-dict shape once per process lifetime.
_UNKNOWN_DICT_LOGGED: set[tuple[str, frozenset[str]]] = set()

# Ordered candidate keys to probe when coercing a dict to a number.
_CANDIDATE_KEYS = ("seconds", "value", "current", "total", "count")


def coerce_numeric(
    value: Any,
    field_name: str = "<unknown>",
) -> float | None:
    """Coerce an API field value to float, returning None when impossible.

    Handles the following input shapes:

    - ``int`` / ``float``  → cast to float and return.
    - ``str``              → ``float(value)`` on success; None on ValueError.
    - ``dict``             → probe candidate keys in order
                             (``seconds``, ``value``, ``current``, ``total``,
                             ``count``), recursively coerce the first hit.
                             Unknown shapes are logged once at DEBUG and return
                             None.
    - ``None`` / other     → return None.

    Args:
        value:      The raw value from the API response.
        field_name: Name of the field being coerced (used in log messages).

    Returns:
        A ``float`` on success, or ``None`` when the value cannot be coerced.
    """
    if value is None:
        return None

    if isinstance(value, bool):
        # bool is a subclass of int; treat it as non-numeric.
        return None

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            _LOGGER.debug(
                "coerce_numeric: cannot parse string %r for field %r",
                value,
                field_name,
            )
            return None

    if isinstance(value, dict):
        for key in _CANDIDATE_KEYS:
            if key in value:
                return coerce_numeric(value[key], field_name=field_name)

        # No known key found — log once per unique (field_name, key_set) pair.
        key_frozenset = frozenset(value.keys())
        dedup_key = (field_name, key_frozenset)
        if dedup_key not in _UNKNOWN_DICT_LOGGED:
            _UNKNOWN_DICT_LOGGED.add(dedup_key)
            _LOGGER.debug(
                "coerce_numeric: unknown dict shape for field %r with keys %s; "
                "returning None (logged once)",
                field_name,
                sorted(value.keys()),
            )
        return None

    _LOGGER.debug(
        "coerce_numeric: unsupported type %s for field %r; returning None",
        type(value).__name__,
        field_name,
    )
    return None
