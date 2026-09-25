#!/usr/bin/env python3
"""Read-only live verification for the eero-ui 6.0 revamp (phase-6.0-revamp.md § 8.3).

This tool is a two-phase snapshot/diff CLI. It NEVER issues a write against
a live network — it only calls read methods on ``eero.EeroClient`` (and,
optionally, reads instant values from VictoriaMetrics over HTTP). The write
itself is always performed by hand, through the eero-ui web UI, by the
person running the verification (see
``.claude/tasks/live-verification-record.md`` for the exact click-path per
step).

Usage
-----
Capture state before the write:

    python scripts/live-verify.py snapshot --network <network_id> \\
        --out before.json [--victoria-url http://127.0.0.1:8428] \\
        [--cookie-file /path/to/session.json]

Perform the write by hand in the UI, then capture state after:

    python scripts/live-verify.py snapshot --network <network_id> \\
        --out after.json [--victoria-url http://127.0.0.1:8428]

Compare, for a specific § 8.3 step:

    python scripts/live-verify.py diff before.json after.json --step 1

``diff`` prints every field that changed, whether the change matches the
expected outcome for that step, and the reboot verdict (whether ANY eero's
``last_reboot`` moved). It exits non-zero when the diff does not match the
expected outcome for the step (an unexpected field changed, an expected
field failed to change when required, or the reboot verdict does not match
what the step promises).

Recommended invocation (from ``backend/``, so the pinned ``eero-api`` from
the backend's own dependency set is used)::

    cd backend
    UV_PROJECT_ENVIRONMENT=/tmp/eero-ui-venv uv run python ../scripts/live-verify.py \\
        snapshot --network <network_id> --out /tmp/before.json

Never prints session tokens. The cookie file path comes from
``--cookie-file`` or the ``EERO_DASHBOARD_COOKIE_FILE`` environment
variable, exactly as the backend resolves it (``config.py``).
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:  # pragma: no cover - only needed for --victoria-url
    httpx = None  # type: ignore[assignment]

try:
    from eero import EeroClient
except ImportError as exc:  # pragma: no cover - surfaced at runtime
    print(
        "error: the 'eero-api' package is not importable in this interpreter. "
        "Run from backend/ with its dependencies installed (see module "
        "docstring for the recommended `uv run` invocation).",
        file=sys.stderr,
    )
    raise SystemExit(2) from exc


DEFAULT_COOKIE_FILE_ENV = "EERO_DASHBOARD_COOKIE_FILE"


# ---------------------------------------------------------------------------
# Minimal, self-contained envelope helpers.
#
# Deliberately NOT importing backend/app/transformers.py: this tool is
# scoped to stdlib + eero-api + httpx only, and must keep working even if
# the backend package is not on sys.path (e.g. run against a bare venv).
# The extraction rules mirror transformers.py's documented behaviour
# (envelope shape: {"meta": {...}, "data": ...}).
# ---------------------------------------------------------------------------


def extract_data(raw_response: Any) -> dict[str, Any]:
    """Extract the ``data`` dict from a ``{"meta": ..., "data": {...}}`` envelope."""
    if not isinstance(raw_response, dict):
        return {}
    if "meta" in raw_response and "data" in raw_response:
        data = raw_response.get("data")
        return dict(data) if isinstance(data, dict) else {}
    return dict(raw_response)


def extract_list(
    raw_response: Any, list_key: str | None = None
) -> list[dict[str, Any]]:
    """Extract a list from a ``{"meta": ..., "data": [...]}`` envelope."""
    if raw_response is None:
        return []
    if isinstance(raw_response, list):
        return list(raw_response)
    if not isinstance(raw_response, dict):
        return []
    if "meta" in raw_response and "data" in raw_response:
        data = raw_response.get("data")
        if isinstance(data, list):
            return list(data)
        if isinstance(data, dict):
            if list_key and list_key in data and isinstance(data[list_key], list):
                return list(data[list_key])
            for key in ("data", "networks", "eeros", "devices", "profiles"):
                if key in data and isinstance(data[key], list):
                    return list(data[key])
        return []
    if (
        list_key
        and list_key in raw_response
        and isinstance(raw_response[list_key], list)
    ):
        return list(raw_response[list_key])
    return []


def extract_id_from_url(url: str | None) -> str | None:
    """Last path segment of an eero API URL, e.g. '/2.2/eeros/123' -> '123'."""
    if not url:
        return None
    parts = str(url).rstrip("/").split("/")
    return parts[-1] if parts else None


def _normalize_ip_list(value: Any, family: int | None = None) -> list[str]:
    """Coerce a raw value into a sorted list of compressed IP strings.

    IPv6 addresses come back from the eero API fully expanded (lesson
    recorded in error-documentation.md: "expanded vs compressed"); parsing
    through ``ipaddress`` and re-stringifying normalises both families to
    their compressed form so string-equality diffs are meaningful.
    """
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for entry in value:
        if not isinstance(entry, str):
            continue
        try:
            address = ipaddress.ip_address(entry.strip())
        except ValueError:
            continue
        if family is not None and address.version != family:
            continue
        result.append(str(address))
    return sorted(result)


def _mac_from_blacklist_entry(entry: Any) -> str | None:
    if isinstance(entry, str):
        return entry.lower()
    if isinstance(entry, dict):
        mac = entry.get("mac") or entry.get("mac_address")
        if isinstance(mac, str):
            return mac.lower()
    return None


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------


async def _snapshot(
    network_id: str,
    cookie_file: str,
    victoria_url: str | None,
) -> dict[str, Any]:
    async with EeroClient(cookie_file=cookie_file, use_keyring=False) as client:
        raw_network_env = await client.get_network(network_id, refresh_cache=True)
        network_raw = extract_data(raw_network_env)

        raw_eeros_env = await client.get_eeros(network_id, refresh_cache=True)
        eeros_raw = extract_list(raw_eeros_env, "eeros")

        raw_guest_env = await client.get_guest_network(network_id)
        guest_raw = extract_data(raw_guest_env)

        raw_speedtests_env = await client.get_speed_tests(network_id, limit=1)
        speedtests_raw = extract_list(raw_speedtests_env, "speedtest")

        raw_blacklist_env = await client.get_blacklist(network_id)
        blacklist_raw = extract_list(raw_blacklist_env, "blacklist")

        raw_profiles_env = await client.get_profiles(network_id, refresh_cache=True)
        profiles_raw = extract_list(raw_profiles_env, "profiles")

        raw_devices_env = await client.get_devices(network_id, refresh_cache=True)
        devices_raw = extract_list(raw_devices_env, "devices")

        raw_dns_env = await client.get_dns_settings(network_id)
        dns_raw = extract_data(raw_dns_env)

    guest_network_nested = network_raw.get("guest_network")
    if isinstance(guest_network_nested, dict):
        guest_enabled = bool(guest_network_nested.get("enabled"))
        guest_name = guest_network_nested.get("name")
    else:
        guest_enabled = bool(network_raw.get("guest_network_enabled"))
        guest_name = network_raw.get("guest_network_name")
    # Prefer the dedicated get_guest_network() read where present — it is
    # the authoritative source for this resource.
    if guest_raw:
        guest_enabled = bool(guest_raw.get("enabled", guest_enabled))
        guest_name = guest_raw.get("name", guest_name)
    guest_password_set = bool(guest_raw.get("password")) if guest_raw else None

    dns_section = dns_raw.get("dns")
    if not isinstance(dns_section, dict):
        dns_section = {}
    ipv6_container = dns_raw.get("ipv6")
    if not isinstance(ipv6_container, dict):
        ipv6_container = {}
    name_servers = ipv6_container.get("name_servers")
    if not isinstance(name_servers, dict):
        name_servers = {}
    ipv4_custom = dns_section.get("custom")
    if not isinstance(ipv4_custom, dict):
        ipv4_custom = {}

    latest_speed_test = speedtests_raw[0] if speedtests_raw else {}
    speed_test_timestamp = None
    if isinstance(latest_speed_test, dict):
        speed_test_timestamp = latest_speed_test.get("date")

    eeros: dict[str, Any] = {}
    for raw in eeros_raw:
        if not isinstance(raw, dict):
            continue
        eero_id = extract_id_from_url(raw.get("url")) or raw.get("serial")
        if not eero_id:
            continue
        eeros[eero_id] = {
            "serial": raw.get("serial"),
            "location": raw.get("location"),
            "led_on": raw.get("led_on"),
            "led_brightness": raw.get("led_brightness"),
            "last_reboot": raw.get("last_reboot"),
        }

    profiles: dict[str, Any] = {}
    for raw in profiles_raw:
        if not isinstance(raw, dict):
            continue
        profile_id = extract_id_from_url(raw.get("url"))
        if not profile_id:
            continue
        devices_field = raw.get("devices", [])
        if isinstance(devices_field, dict):
            devices_field = devices_field.get("data", [])
        device_ids = sorted(
            {
                extract_id_from_url(dev.get("url"))
                for dev in devices_field
                if isinstance(dev, dict) and extract_id_from_url(dev.get("url"))
            }
        )
        profiles[profile_id] = {
            "name": raw.get("name"),
            "paused": raw.get("paused"),
            "device_ids": device_ids,
        }

    devices: dict[str, Any] = {}
    for raw in devices_raw:
        if not isinstance(raw, dict):
            continue
        device_id = extract_id_from_url(raw.get("url"))
        if not device_id:
            continue
        devices[device_id] = {
            "mac": raw.get("mac"),
            "nickname": raw.get("nickname"),
        }

    blacklist_macs = sorted(
        {mac for mac in (_mac_from_blacklist_entry(e) for e in blacklist_raw) if mac}
    )

    victoria_data = None
    if victoria_url:
        victoria_data = _query_victoria(victoria_url, network_id, list(eeros.keys()))

    return {
        "captured_at": datetime.now(UTC).isoformat(),
        "network_id": network_id,
        "network": {
            "name": network_raw.get("name"),
            "guest_network_enabled": guest_enabled,
            "guest_network_name": guest_name,
            "guest_password_set": guest_password_set,
            "last_reboot": network_raw.get("last_reboot"),
            "speed_test_latest_timestamp": speed_test_timestamp,
            "dns": {
                "ipv4_mode": dns_section.get("mode"),
                "ipv4_servers": _normalize_ip_list(ipv4_custom.get("ips"), family=4),
                "ipv6_mode": name_servers.get("mode"),
                "ipv6_servers": _normalize_ip_list(
                    name_servers.get("custom"), family=6
                ),
                "caching": dns_section.get("caching"),
            },
        },
        "eeros": eeros,
        "blacklist": blacklist_macs,
        "profiles": profiles,
        "devices": devices,
        "victoria": victoria_data,
    }


def _query_victoria(
    victoria_url: str, network_id: str, eero_ids: Iterable[str]
) -> dict[str, Any]:
    """Read current values of the two reboot-timestamp metrics (§ 2.3).

    Read-only instant queries against VictoriaMetrics' Prometheus-compatible
    ``/api/v1/query`` endpoint. Never writes.
    """
    if httpx is None:
        return {"error": "httpx not installed; skipped"}

    result: dict[str, Any] = {
        "eero_network_last_reboot_timestamp_seconds": {},
        "eero_eero_last_reboot_timestamp_seconds": {},
    }
    try:
        with httpx.Client(base_url=victoria_url, timeout=10.0) as vm_client:
            resp = vm_client.get(
                "/api/v1/query",
                params={
                    "query": (
                        f'eero_network_last_reboot_timestamp_seconds{{network_id="{network_id}"}}'
                    )
                },
            )
            resp.raise_for_status()
            for item in resp.json().get("data", {}).get("result", []):
                nid = item.get("metric", {}).get("network_id")
                value = item.get("value", [None, None])[1]
                if nid:
                    result["eero_network_last_reboot_timestamp_seconds"][nid] = value

            for eero_id in eero_ids:
                resp = vm_client.get(
                    "/api/v1/query",
                    params={
                        "query": (
                            "eero_eero_last_reboot_timestamp_seconds"
                            f'{{network_id="{network_id}",eero_id="{eero_id}"}}'
                        )
                    },
                )
                resp.raise_for_status()
                for item in resp.json().get("data", {}).get("result", []):
                    value = item.get("value", [None, None])[1]
                    result["eero_eero_last_reboot_timestamp_seconds"][eero_id] = value
    except Exception as exc:  # pylint: disable=broad-exception-caught
        # Deliberate fail-safe: this read-only check is best-effort; report and continue.
        result["error"] = str(exc)
    return result


def cmd_snapshot(args: argparse.Namespace) -> int:
    import asyncio

    cookie_file = args.cookie_file or os.environ.get(DEFAULT_COOKIE_FILE_ENV)
    if not cookie_file:
        print(
            f"error: no cookie file. Pass --cookie-file or set {DEFAULT_COOKIE_FILE_ENV}.",
            file=sys.stderr,
        )
        return 2
    if not Path(cookie_file).exists():
        print(f"error: cookie file not found: {cookie_file}", file=sys.stderr)
        return 2

    snapshot = asyncio.run(_snapshot(args.network, cookie_file, args.victoria_url))

    out_path = Path(args.out)
    out_path.write_text(
        json.dumps(snapshot, indent=2, sort_keys=True, default=str) + "\n"
    )
    print(f"Wrote snapshot for network {args.network} to {out_path}")
    return 0


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------


@dataclass
class Change:
    path: str
    before: Any
    after: Any


def _diff(before: Any, after: Any, prefix: str = "") -> list[Change]:
    """Recursively diff two snapshot structures.

    Dicts are walked key-by-key (stable regardless of dict ordering). Lists
    are compared as whole values — every list in the snapshot schema is
    pre-sorted at capture time, so a list-level inequality is a real,
    order-independent content change.
    """
    changes: list[Change] = []
    if isinstance(before, dict) and isinstance(after, dict):
        keys = sorted(set(before) | set(after), key=str)
        for key in keys:
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            changes.extend(_diff(before.get(key), after.get(key), child_prefix))
    else:
        if before != after:
            changes.append(Change(prefix, before, after))
    return changes


REBOOT_PATTERN = re.compile(
    r"^(network\.last_reboot"
    r"|eeros\.[^.]+\.last_reboot"
    r"|victoria\.eero_network_last_reboot_timestamp_seconds\..+"
    r"|victoria\.eero_eero_last_reboot_timestamp_seconds\..+)$"
)

IGNORED_PATH_PREFIXES = ("captured_at",)


@dataclass
class StepSpec:
    number: int
    description: str
    pattern: re.Pattern[str]
    expect_reboot: bool
    require_change: bool = True
    max_expected_matches: int | None = None
    forbidden_patterns: list[re.Pattern[str]] = field(default_factory=list)


STEPS: dict[int, StepSpec] = {
    1: StepSpec(
        1,
        "LED off -> on (per eero)",
        re.compile(r"^eeros\.[^.]+\.led_on$"),
        expect_reboot=False,
    ),
    2: StepSpec(
        2,
        "LED brightness 30 -> 100",
        re.compile(r"^eeros\.[^.]+\.led_brightness$"),
        expect_reboot=False,
    ),
    3: StepSpec(
        3,
        "Guest enable/disable, set/clear password",
        re.compile(
            r"^network\.(guest_network_enabled|guest_network_name|guest_password_set)$"
        ),
        expect_reboot=False,
    ),
    4: StepSpec(
        4,
        "Speed test",
        re.compile(r"^network\.speed_test_latest_timestamp$"),
        expect_reboot=False,
    ),
    5: StepSpec(
        5,
        "Reboot one eero (target node only)",
        re.compile(r"^eeros\.[^.]+\.last_reboot$"),
        expect_reboot=True,
        max_expected_matches=1,
        forbidden_patterns=[re.compile(r"^network\.last_reboot$")],
    ),
    6: StepSpec(
        6,
        "Block then unblock a test device by MAC",
        re.compile(r"^blacklist$"),
        expect_reboot=False,
        require_change=False,
    ),
    7: StepSpec(
        7,
        "Rename device",
        re.compile(r"^devices\.[^.]+\.nickname$"),
        expect_reboot=False,
    ),
    8: StepSpec(
        8,
        "Create -> rename -> assign -> pause -> unpause -> delete a profile",
        re.compile(r"^profiles(\..*)?$"),
        expect_reboot=False,
        require_change=False,
    ),
    9: StepSpec(
        9,
        "set_network_name, renamed back immediately (mesh reboot assumed)",
        re.compile(r"^(network\.name|network\.last_reboot|eeros\.[^.]+\.last_reboot)$"),
        expect_reboot=True,
        require_change=False,
    ),
    10: StepSpec(
        10,
        "DNS caching toggle (characterised control, reboots mesh)",
        re.compile(
            r"^(network\.dns\.caching|network\.last_reboot|eeros\.[^.]+\.last_reboot)$"
        ),
        expect_reboot=True,
    ),
}


def _is_reboot_path(path: str) -> bool:
    return bool(REBOOT_PATTERN.match(path))


def cmd_diff(args: argparse.Namespace) -> int:
    before_path = Path(args.before)
    after_path = Path(args.after)
    before = json.loads(before_path.read_text())
    after = json.loads(after_path.read_text())

    all_changes = [
        c
        for c in _diff(before, after)
        if not any(c.path.startswith(prefix) for prefix in IGNORED_PATH_PREFIXES)
    ]

    reboot_changes = [c for c in all_changes if _is_reboot_path(c.path)]
    reboot_detected = bool(reboot_changes)

    print(f"Live verification diff: {before_path.name} -> {after_path.name}")
    print(f"Network: {before.get('network_id')}")
    print()
    print(f"All changed fields ({len(all_changes)}):")
    if not all_changes:
        print("  (none)")
    for change in all_changes:
        print(f"  {change.path}: {change.before!r} -> {change.after!r}")
    print()
    print(
        "Reboot verdict: "
        + ("DETECTED" if reboot_detected else "NOT DETECTED")
        + (
            f" (via: {', '.join(c.path for c in reboot_changes)})"
            if reboot_changes
            else ""
        )
    )

    if args.step is None:
        # No step specified: report only, no pass/fail exit code.
        return 0

    spec = STEPS.get(args.step)
    if spec is None:
        print(f"error: unknown --step {args.step} (valid range: 1-10)", file=sys.stderr)
        return 2

    print()
    print(f"--- Step {spec.number}: {spec.description} ---")

    expected_matches = [c for c in all_changes if spec.pattern.match(c.path)]
    unexpected_changes = [c for c in all_changes if not spec.pattern.match(c.path)]

    failures: list[str] = []

    if unexpected_changes:
        failures.append(
            "unexpected field(s) changed: "
            + ", ".join(c.path for c in unexpected_changes)
        )

    if spec.require_change and not expected_matches:
        failures.append("expected field(s) matching the step did not change")

    if (
        spec.max_expected_matches is not None
        and len(expected_matches) > spec.max_expected_matches
    ):
        failures.append(
            f"expected at most {spec.max_expected_matches} matching change(s), "
            f"got {len(expected_matches)}: {', '.join(c.path for c in expected_matches)}"
        )

    for forbidden in spec.forbidden_patterns:
        forbidden_hits = [c for c in all_changes if forbidden.match(c.path)]
        if forbidden_hits:
            failures.append(
                "forbidden field changed for this step: "
                + ", ".join(c.path for c in forbidden_hits)
            )

    if reboot_detected != spec.expect_reboot:
        failures.append(
            f"reboot verdict mismatch: expected reboot={spec.expect_reboot}, "
            f"observed reboot={reboot_detected}"
        )

    print(f"Expected-field changes: {len(expected_matches)}")
    for change in expected_matches:
        print(f"  {change.path}: {change.before!r} -> {change.after!r}")

    if failures:
        print()
        print("Result: FAIL")
        for reason in failures:
            print(f"  - {reason}")
        return 1

    print()
    print("Result: PASS — matches the expected outcome for this step.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only snapshot/diff tool for eero-ui 6.0 live write verification "
            "(phase-6.0-revamp.md § 8.3). Never issues a write."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser(
        "snapshot", help="Capture a read-only snapshot of network state."
    )
    snapshot_parser.add_argument("--network", required=True, help="Network ID.")
    snapshot_parser.add_argument(
        "--out", required=True, help="Path to write the snapshot JSON."
    )
    snapshot_parser.add_argument(
        "--cookie-file",
        default=None,
        help=f"Path to the eero session cookie file (default: ${DEFAULT_COOKIE_FILE_ENV}).",
    )
    snapshot_parser.add_argument(
        "--victoria-url",
        default=None,
        help="Base URL of VictoriaMetrics (e.g. http://127.0.0.1:8428). Optional.",
    )
    snapshot_parser.set_defaults(func=cmd_snapshot)

    diff_parser = subparsers.add_parser(
        "diff", help="Compare two snapshots and report the § 8.3 verdict for a step."
    )
    diff_parser.add_argument("before", help="Path to the 'before' snapshot JSON.")
    diff_parser.add_argument("after", help="Path to the 'after' snapshot JSON.")
    diff_parser.add_argument(
        "--step",
        type=int,
        choices=range(1, 11),
        default=None,
        help="§ 8.3 step number (1-10). Without it, prints the raw diff only.",
    )
    diff_parser.set_defaults(func=cmd_diff)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
