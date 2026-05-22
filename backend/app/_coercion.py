"""Type coercion helpers for raw Eero Cloud API responses.

The Eero Cloud API occasionally changes field shapes between releases — a
numeric field may become a structured dict (e.g. uptime: 1000 becomes
uptime: {"seconds": 1000, "human": "16m"}), and a boolean field may arrive
as a string or a nested object. This module provides safe coercion so
callers always receive a predictable type (or None) instead of crashing
downstream model validation.
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


def coerce_int(
    value: Any,
    field_name: str = "<unknown>",
) -> int | None:
    """Coerce an API field value to int, returning None when impossible.

    Built on top of :func:`coerce_numeric`, so it handles the same input
    shapes (int, float, numeric string, dict with a candidate key). A
    fractional float is truncated toward zero.

    Args:
        value:      The raw value from the API response.
        field_name: Name of the field being coerced (used in log messages).

    Returns:
        An ``int`` on success, or ``None`` when the value cannot be coerced.
    """
    numeric = coerce_numeric(value, field_name=field_name)
    return int(numeric) if numeric is not None else None


# Truthy / falsy string tokens recognised when coercing strings to bool.
_TRUE_TOKENS = frozenset({"true", "1", "yes", "on", "enabled"})
_FALSE_TOKENS = frozenset({"false", "0", "no", "off", "disabled", ""})

# Ordered candidate keys to probe when coercing a dict to a bool.
_BOOL_CANDIDATE_KEYS = ("enabled", "value", "available", "active")


def coerce_bool(
    value: Any,
    field_name: str = "<unknown>",
) -> bool | None:
    """Coerce an API field value to bool, returning None when impossible.

    Handles the following input shapes:

    - ``bool``             → returned unchanged.
    - ``int`` / ``float``  → ``bool(value)`` (``0`` is False, non-zero True).
    - ``str``              → recognised truthy/falsy tokens (case-insensitive);
                             unrecognised strings return None.
    - ``dict``             → probe candidate keys in order
                             (``enabled``, ``value``, ``available``,
                             ``active``); if none match, a non-empty dict is
                             treated as True (the structured value being
                             present implies the feature is set).
    - ``None`` / other     → return None.

    Args:
        value:      The raw value from the API response.
        field_name: Name of the field being coerced (used in log messages).

    Returns:
        A ``bool`` on success, or ``None`` when the value cannot be coerced.
    """
    if value is None:
        return None

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return bool(value)

    if isinstance(value, str):
        token = value.strip().lower()
        if token in _TRUE_TOKENS:
            return True
        if token in _FALSE_TOKENS:
            return False
        _LOGGER.debug(
            "coerce_bool: cannot parse string %r for field %r",
            value,
            field_name,
        )
        return None

    if isinstance(value, dict):
        for key in _BOOL_CANDIDATE_KEYS:
            if key in value:
                return coerce_bool(value[key], field_name=field_name)
        # No known key — a populated structured value implies "set/enabled".
        return bool(value)

    _LOGGER.debug(
        "coerce_bool: unsupported type %s for field %r; returning None",
        type(value).__name__,
        field_name,
    )
    return None
