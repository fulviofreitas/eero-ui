"""Render eero-ui against SYNTHETIC data and screenshot it for the README.

No eero account, session or network is involved: every eero, device, profile,
speed test, data-usage point and setting below is invented in ``FIXTURES`` —
a small fictional mesh ("Maple Street", 4 eeros, ~24 devices, 4 profiles) —
and served to the built frontend over Playwright's own request interception
(``page.route('**/api/**', ...)``). The real backend is never started, no
credential file or session is read, and nothing is sent to the eero cloud.

Usage::

    cd frontend && npm run build        # once, or after any frontend change
    python3 scripts/render-readme-screenshots.py shots \\
        --build-dir frontend/build --out docs/screenshots/readme

    # Or do both steps in one call:
    python3 scripts/render-readme-screenshots.py all --out docs/screenshots/readme

    # Inspect the fixtures (and feed them to the real-data grep check):
    python3 scripts/render-readme-screenshots.py fixtures > /tmp/fixtures.json

``shots`` serves ``frontend/build`` with a plain static file server on
``localhost`` (SPA fallback: any unmatched path gets ``index.html``, matching
``vite preview``'s own behaviour for this project), opens Chromium at
``/usr/bin/chromium``, answers every ``/api/**`` request from the fixtures
below, and fails loudly (non-zero exit) if any request goes unanswered or the
page logs a console/page error. Re-running produces byte-identical images: the
RNG is seeded, "now" is fixed, and CSS/JS animations are disabled via
``reduced_motion="reduce"``.
"""

from __future__ import annotations

import argparse
import http.server
import json
import random
import re
import socket
import subprocess  # nosec B404 - fixed argv, no shell, dev-tooling only
import sys
import threading
import time
import urllib.request
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUILD_DIR = REPO_ROOT / "frontend" / "build"
DEFAULT_OUT_DIR = REPO_ROOT / "docs" / "screenshots" / "readme"
CHROMIUM_PATH = "/usr/bin/chromium"

# Fixed "now" so every run (and every image) is byte-for-byte reproducible.
NOW = datetime(2026, 10, 7, 12, 0, 0, tzinfo=timezone.utc)
RNG_SEED = 1337

NETWORK_ID = "net-maple"

# ---------------------------------------------------------------------------
# A small fictional mesh. All identifiers below are invented: MACs use the
# locally-administered 02: prefix, IPv4 lives in the 192.168.4.0/22
# documentation-adjacent private range, IPv6 uses the IANA documentation
# prefix 2001:db8::/32, e-mails are @example.com, and the ISP is "Example
# Fiber". None of this touches, resembles, or was derived from any real eero
# account.
# ---------------------------------------------------------------------------

NETWORK_NAME = "Maple Street"

EEROS = [
    {
        "id": "e1",
        "serial": "M7LR0001",
        "mac": "02:00:00:aa:00:01",
        "model": "eero Max 7",
        "location": "Living Room",
        "is_gateway": True,
        "wired": True,
        "mesh_quality_bars": 5,
        "firmware": "8.5.1-28",
        "ip": "192.168.4.1",
    },
    {
        "id": "e2",
        "serial": "E7OF0002",
        "mac": "02:00:00:aa:00:02",
        "model": "eero 7",
        "location": "Office",
        "is_gateway": False,
        "wired": False,
        "mesh_quality_bars": 4,
        "firmware": "8.5.1-28",
        "ip": "192.168.4.2",
    },
    {
        "id": "e3",
        "serial": "E7UH0003",
        "mac": "02:00:00:aa:00:03",
        "model": "eero 7",
        "location": "Upstairs Hall",
        "is_gateway": False,
        "wired": False,
        "mesh_quality_bars": 3,
        "firmware": "8.5.1-28",
        "ip": "192.168.4.3",
    },
    {
        "id": "e4",
        "serial": "EOGR0004",
        "mac": "02:00:00:aa:00:04",
        "model": "eero Outdoor 7",
        "location": "Garage",
        "is_gateway": False,
        "wired": True,
        "mesh_quality_bars": 4,
        "firmware": "8.5.1-28",
        "ip": "192.168.4.4",
    },
]

PROFILES = [
    {"id": "p1", "name": "Parents"},
    {"id": "p2", "name": "Kids"},
    {"id": "p3", "name": "Guests"},
    {"id": "p4", "name": "Smart Home"},
]

_DEVICE_CATALOG = [
    ("Sarah's iPhone 16", "Apple", "phone", True),
    ("Mark's Pixel 9", "Google", "phone", True),
    ("Kitchen iPad", "Apple", "tablet", True),
    ("Sarah's MacBook Pro", "Apple", "computer", False),
    ("Mark's ThinkPad", "Lenovo", "computer", True),
    ("Living Room TV", "Samsung", "tv", False),
    ("Office TV", "LG", "tv", True),
    ("Living Room Sonos", "Sonos", "speaker", True),
    ("Kitchen Echo", "Amazon", "speaker", True),
    ("Front Door Camera", "Ring", "camera", True),
    ("Backyard Camera", "Ring", "camera", True),
    ("Garage Smart Plug", "TP-Link", "iot", True),
    ("Living Room Smart Plug", "TP-Link", "iot", True),
    ("Thermostat", "Ecobee", "iot", True),
    ("Robot Vacuum", "iRobot", "iot", True),
    ("PlayStation 5", "Sony", "console", False),
    ("Nintendo Switch", "Nintendo", "console", True),
    ("Kid's Tablet", "Amazon", "tablet", True),
    ("Kid's Chromebook", "Google", "computer", True),
    ("Guest Phone", "Samsung", "phone", True),
    ("Printer", "HP", "iot", False),
    ("Apple Watch", "Apple", "watch", True),
    ("Smart Doorbell", "Ring", "camera", True),
    ("Network Storage", "Synology", "computer", False),
]

_BANDS = ["2.4GHz", "5GHz", "6GHz"]


def _mac(i: int) -> str:
    return f"02:00:00:bb:{(i // 256) & 0xFF:02x}:{i & 0xFF:02x}"


def _build_devices() -> list[dict[str, Any]]:
    rng = random.Random(RNG_SEED)
    devices = []
    for i, (name, manufacturer, device_type, wireless) in enumerate(
        _DEVICE_CATALOG, start=1
    ):
        eero = EEROS[i % len(EEROS)]
        blocked = i in (20,)  # "Guest Phone"
        paused = i in (18,)  # "Kid's Chromebook"
        band = _BANDS[i % 3] if wireless else None
        signal = -1 * rng.randint(38, 78) if wireless else None
        profile = (
            PROFILES[i % 4]["name"]
            if device_type in ("phone", "tablet", "computer")
            else None
        )
        devices.append(
            {
                "id": f"d{i:02d}",
                "mac": _mac(i),
                "ip": f"192.168.{4 + (i // 250)}.{10 + (i % 240)}",
                "nickname": name,
                "hostname": name.lower().replace(" ", "-").replace("'", ""),
                "manufacturer": manufacturer,
                "device_type": device_type,
                "connected": i != 24,  # Network Storage is briefly offline
                "wireless": wireless,
                "blocked": blocked,
                "paused": paused,
                "is_guest": i == 20,
                "connection_type": "wireless" if wireless else "wired",
                "signal_strength": signal,
                "frequency": band,
                "connected_to_eero": eero["location"],
                "connected_to_eero_id": eero["id"],
                "connected_to_eero_model": eero["model"],
                "profile_name": profile,
                "profile_id": next(
                    (p["id"] for p in PROFILES if p["name"] == profile), None
                ),
                "last_active": (NOW - timedelta(minutes=rng.randint(0, 600)))
                .isoformat()
                .replace("+00:00", "Z"),
            }
        )
    return devices


DEVICES = _build_devices()


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _build_speedtests(count: int = 20) -> list[dict[str, Any]]:
    """~20 results spread over the last 14 days, ~940/880 Mbps fibre + jitter."""
    rng = random.Random(RNG_SEED + 1)
    results = []
    span_hours = 14 * 24
    for i in range(count):
        offset_h = (span_hours / count) * i
        ts = NOW - timedelta(hours=offset_h)
        download = 940 + rng.uniform(-18, 12)
        upload = 880 + rng.uniform(-15, 10)
        latency = 8 + rng.uniform(0, 6)
        results.append(
            {
                "download_mbps": round(download, 1),
                "upload_mbps": round(upload, 1),
                "latency_ms": round(latency, 1),
                "timestamp": _iso(ts),
            }
        )
    return results  # newest first


SPEEDTESTS = _build_speedtests()


def _diurnal_bytes(hour: int, rng: random.Random, base: float) -> float:
    """Shape a day's usage with an evening peak, a quiet overnight trough."""
    peak = 0.55 + 0.45 * max(0.0, 1 - abs(hour - 20) / 8)
    quiet = 0.15 if 1 <= hour <= 6 else 1.0
    return base * peak * quiet * rng.uniform(0.85, 1.15)


def _build_data_usage(
    days: int = 30, scale: float = 1.0, seed: int = 0
) -> dict[str, Any]:
    """Daily usage for one entity; ``scale`` is its share of the whole network."""
    rng = random.Random(RNG_SEED + 2 + seed)
    values = []
    total_down = 0.0
    total_up = 0.0
    for d in range(days, 0, -1):
        day = NOW - timedelta(days=d)
        weekday_factor = 1.25 if day.weekday() >= 5 else 1.0
        down = _diurnal_bytes(20, rng, 42_000_000_000) * weekday_factor * scale
        up = _diurnal_bytes(20, rng, 6_500_000_000) * weekday_factor * scale
        total_down += down
        total_up += up
        values.append(
            {
                "time": _iso(day.replace(hour=0, minute=0, second=0, microsecond=0)),
                "download": round(down),
                "upload": round(up),
            }
        )
    return {
        "download_bytes": round(total_down),
        "upload_bytes": round(total_up),
        "values": values,
        "raw": {},
    }


DATA_USAGE = _build_data_usage()


def _stable_hash(value: str) -> int:
    """Deterministic cross-process string hash (Python's builtin ``hash()``
    is salted per-process by default, which would make any RNG seeded from
    it non-reproducible run-to-run)."""
    return zlib.crc32(value.encode())


def _build_insights(insight_type: str, days: int = 14) -> dict[str, Any]:
    rng = random.Random(RNG_SEED + _stable_hash(insight_type) % 97)
    base = {"blocked": 65, "adblock": 210, "inspected": 540}.get(insight_type, 50)
    values = []
    total = 0
    for d in range(days, 0, -1):
        day = NOW - timedelta(days=d)
        count = max(0, round(base * rng.uniform(0.6, 1.4)))
        total += count
        values.append(
            {
                "time": _iso(day.replace(hour=0, minute=0, second=0, microsecond=0)),
                "value": count,
            }
        )
    return {"series": [{"insight_type": insight_type, "sum": total, "values": values}]}


def _build_events(count: int = 15) -> dict[str, Any]:
    rng = random.Random(RNG_SEED + 3)
    kinds = [
        ("device_connected", "{name} connected"),
        ("device_disconnected", "{name} disconnected"),
        ("device_paused", "{name} paused"),
        ("guest_network_updated", "Guest network settings updated"),
        ("network_updated", "Network settings updated"),
    ]
    events = []
    for i in range(count):
        kind, template = kinds[i % len(kinds)]
        device = DEVICES[i % len(DEVICES)]
        message = template.format(name=device["nickname"])
        ts = NOW - timedelta(minutes=rng.randint(5, 2880))
        events.append({"timestamp": _iso(ts), "type": kind, "message": message})
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return {"events": events}


def _build_channel_utilization(band: str) -> dict[str, Any]:
    rng = random.Random(RNG_SEED + 4 + _stable_hash(band) % 53)
    channels = [1, 6, 11] if "2_4" in band or "2.4" in band else [36, 40, 44, 149, 157]
    series = [
        {"channel": c, "utilization": round(rng.uniform(0.08, 0.55), 2)}
        for c in channels
    ]
    return {"band": band, "series": series}


def _build_roaming() -> dict[str, Any]:
    rng = random.Random(RNG_SEED + 5)
    mobile_devices = [
        d for d in DEVICES if d["device_type"] in ("phone", "tablet", "watch")
    ]
    events = []
    for i in range(10):
        device = mobile_devices[i % len(mobile_devices)]
        from_eero, to_eero = rng.sample(EEROS, 2)
        ts = NOW - timedelta(minutes=rng.randint(5, 1400))
        events.append(
            {
                "timestamp": _iso(ts),
                "previous_seen": _iso(ts - timedelta(minutes=rng.randint(1, 30))),
                "device_id": device["id"],
                "device_name": device["nickname"],
                "mac": device["mac"],
                "event_type": "move",
                "from_node": {
                    "name": from_eero["location"],
                    "eero_id": from_eero["id"],
                },
                "to_node": {"name": to_eero["location"], "eero_id": to_eero["id"]},
            }
        )
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    top_roamers = [
        {
            "device_id": d["id"],
            "device_name": d["nickname"],
            "moves": rng.randint(3, 22),
        }
        for d in mobile_devices[:3]
    ]
    return {
        "network_id": NETWORK_ID,
        "range": "24h",
        "start": int((NOW - timedelta(hours=24)).timestamp()),
        "end": int(NOW.timestamp()),
        "resolution_seconds": 60,
        "total_events": len(events),
        "truncated": False,
        "events": events,
        "top_roamers": top_roamers,
    }


def _build_eero_connections(eero_id: str) -> dict[str, Any]:
    """Matches ``EeroConnection`` (backend/app/routes/eeros.py) - the
    flattened wireless_devices + ports.interfaces shape, not the legacy
    top-level ``connections`` fallback.
    """
    eero = next(e for e in EEROS if e["id"] == eero_id)
    connections = []
    for d in DEVICES:
        if d["connected_to_eero_id"] != eero_id or not d["connected"]:
            continue
        if d["wireless"]:
            connections.append(
                {
                    "id": d["id"],
                    "url": f"/devices/{d['id']}",
                    "display_name": d["nickname"],
                    "connection_type": "wireless",
                    "kind": "wireless",
                    "entity_type": "client",
                    "device_type": d["device_type"],
                    "band": d["frequency"],
                }
            )
        else:
            connections.append(
                {
                    "id": d["id"],
                    "url": f"/devices/{d['id']}",
                    "display_name": d["nickname"],
                    "connection_type": "wired",
                    "kind": "wired",
                    "entity_type": "client",
                    "device_type": d["device_type"],
                    "port": "eth1",
                    "is_upstream": False,
                    "negotiated_speed": "1Gbps",
                }
            )
    if not eero["is_gateway"]:
        # The uplink back to the gateway, reported as a wired/wireless "eero" entity.
        connections.insert(
            0,
            {
                "id": "e1",
                "url": "/eeros/e1",
                "display_name": "Living Room",
                "connection_type": "wired" if eero["wired"] else "wireless",
                "kind": "wired" if eero["wired"] else "wireless",
                "entity_type": "eero",
                "device_type": None,
                "port": "eth0" if eero["wired"] else None,
                "is_upstream": True,
                "negotiated_speed": "1Gbps" if eero["wired"] else None,
            },
        )
    return {"connections": connections}


# ---------------------------------------------------------------------------
# Route table. Each entry: (method, path_template, handler).
# ``path_template`` uses FastAPI-style ``{name}`` placeholders.
# ---------------------------------------------------------------------------

Handler = Callable[[dict[str, str], dict[str, list[str]], Any], tuple[int, Any]]


def _network_summary() -> dict[str, Any]:
    return {
        "id": NETWORK_ID,
        "name": NETWORK_NAME,
        "status": "online",
        "guest_network_enabled": True,
        "public_ip": "203.0.113.42",
        "isp_name": "Example Fiber",
    }


def _network_detail() -> dict[str, Any]:
    latest = SPEEDTESTS[0]
    return {
        **_network_summary(),
        "device_count": len(DEVICES),
        "eero_count": len(EEROS),
        "speed_test": latest,
        "health": {"status": "good", "uptime_percentage": 99.95},
        "settings": None,
        "owner": "sarah@example.com",
        "display_name": NETWORK_NAME,
        "network_customer_type": "residential",
        "premium_status": "active",
        "created_at": "2023-03-14T00:00:00Z",
        "gateway": EEROS[0]["id"],
        "wan_type": "dhcp",
        "gateway_ip": "203.0.113.1",
        "connection_mode": "NAT",
        "backup_internet_enabled": True,
        "power_saving": False,
        "sqm": False,
        "upnp": False,
        "thread": True,
        "band_steering": True,
        "wpa3": True,
        "ipv6_upstream": True,
        "ipv6": {"name_servers": {"mode": "automatic"}},
        "dns": {
            "mode": "custom",
            "custom": {"ips": ["1.1.1.1", "1.0.0.1"]},
            "caching": True,
        },
        "premium_dns": {"dns_policies_enabled": True, "dns_provider": "eero"},
        "geo_ip": {
            "countryCode": "US",
            "countryName": "United States",
            "city": "Portland",
            "region": "Oregon",
            "timezone": "America/Los_Angeles",
            "isp": "Example Fiber",
        },
        "updates": {
            "target_firmware": "8.5.1-28",
            "update_required": False,
            "has_update": False,
            "can_update_now": False,
            "last_update_started": None,
        },
        "dhcp": {
            "lease_time_seconds": 86400,
            "subnet_mask": "255.255.252.0",
            "starting_address": "192.168.4.10",
            "ending_address": "192.168.7.250",
        },
        "ddns": {"enabled": False, "subdomain": ""},
        "homekit": {"enabled": False, "managedNetworkEnabled": False},
        "ip_settings": {"double_nat": False, "public_ip": "203.0.113.42"},
        "premium_details": {
            "tier": "eero plus",
            "payment_method": "apple",
            "next_billing_event_date": "2026-11-14T00:00:00Z",
        },
        "amazon_account_linked": False,
        "alexa_skill": False,
        "last_reboot": _iso(NOW - timedelta(days=9, hours=3)),
    }


def _eero_summary(e: dict[str, Any]) -> dict[str, Any]:
    connected = [
        d for d in DEVICES if d["connected_to_eero_id"] == e["id"] and d["connected"]
    ]
    return {
        "id": e["id"],
        "url": f"/eeros/{e['id']}",
        "serial": e["serial"],
        "mac_address": e["mac"],
        "model": e["model"],
        "status": "green",
        "location": e["location"],
        "is_gateway": e["is_gateway"],
        "is_primary": e["is_gateway"],
        "connected_clients_count": len(connected),
        "firmware_version": e["firmware"],
        "ip_address": e["ip"],
        "mesh_quality_bars": e["mesh_quality_bars"],
        "led_on": True,
        "wired": e["wired"],
    }


def _eero_detail(e: dict[str, Any]) -> dict[str, Any]:
    connected = [
        d for d in DEVICES if d["connected_to_eero_id"] == e["id"] and d["connected"]
    ]
    wired = [d for d in connected if not d["wireless"]]
    wireless = [d for d in connected if d["wireless"]]
    return {
        **_eero_summary(e),
        "model_number": None,
        "state": "ONLINE",
        "connection_type": "wired" if e["wired"] else "wireless",
        "using_wan": e["is_gateway"],
        "connected_wired_clients_count": len(wired),
        "connected_wireless_clients_count": len(wireless),
        "os_version": e["firmware"],
        "led_brightness": 80,
        "uptime": 9 * 86400 + 3 * 3600,
        "cpu_usage": 0.12,
        "memory_usage": 0.34,
        "temperature": 41.2,
        "heartbeat_ok": True,
        "update_available": False,
        "provides_wifi": True,
        "auto_provisioned": not e["is_gateway"],
        "retrograde_capable": True,
        "last_heartbeat": _iso(NOW - timedelta(seconds=20)),
        "last_reboot": _iso(NOW - timedelta(days=9, hours=3)),
        "joined": "2023-03-14T00:00:00Z",
        "network_name": NETWORK_NAME,
        "network_url": f"/networks/{NETWORK_ID}",
        "bands": _BANDS,
        "wifi_bssids": None,
        "bssids_with_bands": None,
        "ethernet_addresses": None,
        "ethernet_ports": None,
        "ipv6_addresses": ["2001:db8::1"],
        "organization_name": None,
        "organization_id": None,
        "power_source": "AC",
        "power_saving_active": False,
    }


def _device_summary(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": d["id"],
        "url": f"/devices/{d['id']}",
        "mac": d["mac"],
        "ip": d["ip"],
        "nickname": d["nickname"],
        "hostname": d["hostname"],
        "display_name": d["nickname"],
        "manufacturer": d["manufacturer"],
        "model_name": None,
        "device_type": d["device_type"],
        "connected": d["connected"],
        "wireless": d["wireless"],
        "blocked": d["blocked"],
        "paused": d["paused"],
        "is_guest": d["is_guest"],
        "connection_type": d["connection_type"],
        "signal_strength": d["signal_strength"],
        "frequency": d["frequency"],
        "connected_to_eero": d["connected_to_eero"],
        "last_active": d["last_active"],
        "profile_id": d["profile_id"],
        "profile_name": d["profile_name"],
    }


def _device_detail(d: dict[str, Any]) -> dict[str, Any]:
    signal_bars = None
    if d["signal_strength"] is not None:
        signal_bars = max(1, min(4, round((d["signal_strength"] + 90) / 12)))
    return {
        **_device_summary(d),
        "ips": [d["ip"]],
        "ipv4": d["ip"],
        "is_private": False,
        "signal_bars": signal_bars,
        "frequency_mhz": 5180
        if d["frequency"] == "5GHz"
        else (6115 if d["frequency"] == "6GHz" else 2437),
        "channel": 36
        if d["frequency"] == "5GHz"
        else (37 if d["frequency"] == "6GHz" else 6),
        "ssid": "Maple Street" if not d["is_guest"] else "Maple Street Guest",
        "rx_bitrate": "866.7 Mbit/s" if d["wireless"] else None,
        "tx_bitrate": "866.7 Mbit/s" if d["wireless"] else None,
        "connected_to_eero_id": d["connected_to_eero_id"],
        "connected_to_eero_model": d["connected_to_eero_model"],
        "first_active": "2024-01-10T00:00:00Z",
        "network_id": NETWORK_ID,
        "subnet_kind": "guest" if d["is_guest"] else "main",
        "auth": None,
    }


def _profile_summary(p: dict[str, Any]) -> dict[str, Any]:
    device_ids = [d["id"] for d in DEVICES if d["profile_id"] == p["id"]]
    return {
        "id": p["id"],
        "url": f"/profiles/{p['id']}",
        "name": p["name"],
        "paused": p["id"] == "p3",
        "device_count": len(device_ids),
        "device_ids": device_ids,
        "devices": [],
    }


FIXTURES: dict[str, Any] = {
    "network_summary": [_network_summary()],
    "network_detail": _network_detail(),
    "eeros": [_eero_summary(e) for e in EEROS],
    "eero_details": {e["id"]: _eero_detail(e) for e in EEROS},
    "devices": [_device_summary(d) for d in DEVICES],
    "device_details": {d["id"]: _device_detail(d) for d in DEVICES},
    "profiles": [_profile_summary(p) for p in PROFILES],
    "speedtests": SPEEDTESTS,
    "data_usage": DATA_USAGE,
    "events": _build_events(),
    "roaming": _build_roaming(),
}


def _json_response(status: int, body: Any) -> tuple[int, Any]:
    return status, body


# Share of the network's traffic per entity kind, so a phone is not shown moving
# as much data as the whole house.
_USAGE_SCALE = {"network": 1.0, "eero": 0.3, "profile": 0.25, "device": 0.02}


def _windowed_usage(query, scale: float, seed: int) -> dict[str, Any]:
    """Usage for the requested ``start``/``end`` window (the 24h/7d/30d selector)."""
    usage = _build_data_usage(scale=scale, seed=seed) if scale != 1.0 else DATA_USAGE
    start = (query.get("start") or [None])[0]
    end = (query.get("end") or [None])[0]
    if not start or not end:
        return usage
    lo = datetime.fromisoformat(start.replace("Z", "+00:00"))
    hi = datetime.fromisoformat(end.replace("Z", "+00:00"))
    values = [
        v
        for v in usage["values"]
        if lo - timedelta(days=1)
        < datetime.fromisoformat(v["time"].replace("Z", "+00:00"))
        <= hi
    ]
    return {
        "download_bytes": sum(v["download"] for v in values),
        "upload_bytes": sum(v["upload"] for v in values),
        "values": values,
        "raw": {},
    }


def _route_data_usage(params, query, body):
    return _json_response(200, _windowed_usage(query, _USAGE_SCALE["network"], 0))


def _usage_route(kind: str, key: str):
    def route(params, query, body):
        seed = _stable_hash(f"{kind}:{params.get(key, '')}") % 1000
        jitter = 0.6 + (seed % 80) / 100
        return _json_response(
            200, _windowed_usage(query, _USAGE_SCALE[kind] * jitter, seed)
        )

    return route


def _route_insights(params, query, body):
    insight_type = (query.get("insight_type") or ["blocked"])[0]
    return _json_response(200, _build_insights(insight_type))


def _route_events(params, query, body):
    return _json_response(200, FIXTURES["events"])


def _route_channel_utilization(params, query, body):
    band = (query.get("band") or ["band_5GHz"])[0]
    return _json_response(200, _build_channel_utilization(band))


def _route_eero_connections(params, query, body):
    return _json_response(200, _build_eero_connections(params["eero_id"]))


def _metrics_response(
    values: list[tuple[float, float]], metric_labels: dict[str, str]
) -> dict[str, Any]:
    return {
        "status": "success",
        "data": {
            "resultType": "matrix",
            "result": [
                {
                    "metric": metric_labels,
                    "values": [[ts, f"{value:.2f}"] for ts, value in values],
                }
            ],
        },
    }


def _series_over_window(
    query: dict[str, list[str]],
    rng: random.Random,
    base: float,
    jitter: float,
    *,
    allow_negative: bool = False,
):
    """Build (timestamp, value) pairs honouring the request's start/end/step
    when present, else defaulting to the last 24h at 5-minute resolution."""

    def _parse_ts(raw: str | None, fallback: datetime) -> float:
        if not raw:
            return fallback.timestamp()
        try:
            return float(raw)
        except ValueError:
            pass
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return fallback.timestamp()

    start_ts = _parse_ts((query.get("start") or [None])[0], NOW - timedelta(hours=24))
    end_ts = _parse_ts((query.get("end") or [None])[0], NOW)
    step_s = 300
    points = []
    t = start_ts
    while t <= end_ts and len(points) < 500:
        value = base + rng.uniform(-jitter, jitter)
        if not allow_negative:
            value = max(0.0, value)
        points.append((t, value))
        t += step_s
    if not points:
        points = [(end_ts, base)]
    return points


def _route_speedtest_history(params, query, body):
    rng = random.Random(RNG_SEED + 6)
    download = _series_over_window(query, rng, 940, 15)
    upload = _series_over_window(query, random.Random(RNG_SEED + 7), 880, 12)
    return _json_response(
        200,
        {
            "download": _metrics_response(
                download, {"__name__": "eero_speedtest_download_mbps"}
            ),
            "upload": _metrics_response(
                upload, {"__name__": "eero_speedtest_upload_mbps"}
            ),
        },
    )


def _route_device_signal_history(params, query, body):
    rng = random.Random(RNG_SEED + 8)
    signal = _series_over_window(query, rng, -55, 8, allow_negative=True)
    score = _series_over_window(query, random.Random(RNG_SEED + 9), 85, 6)
    return _json_response(
        200,
        {
            "signal_strength": _metrics_response(
                signal, {"__name__": "eero_device_signal_strength"}
            ),
            "connection_score": _metrics_response(
                score, {"__name__": "eero_device_connection_score"}
            ),
        },
    )


def _route_client_count_history(params, query, body):
    rng = random.Random(RNG_SEED + 10)
    total = _series_over_window(query, rng, 22, 4)
    wireless = _series_over_window(query, random.Random(RNG_SEED + 11), 17, 3)
    wired = _series_over_window(query, random.Random(RNG_SEED + 12), 5, 1)
    return _json_response(
        200,
        {
            "total": _metrics_response(
                total, {"__name__": "eero_network_client_count_total"}
            ),
            "wireless": _metrics_response(
                wireless, {"__name__": "eero_network_client_count_wireless"}
            ),
            "wired": _metrics_response(
                wired, {"__name__": "eero_network_client_count_wired"}
            ),
            "client_count": _metrics_response(
                total, {"__name__": "eero_network_client_count_total"}
            ),
        },
    )


ROUTES: list[tuple[str, str, Handler]] = [
    (
        "GET",
        "/api/health",
        lambda p, q, b: _json_response(
            200,
            {
                "status": "healthy",
                "version": "6.1.3",
                "eero_client_version": "8.0.5",
                "experimental_writes": True,
            },
        ),
    ),
    (
        "GET",
        "/api/auth/status",
        lambda p, q, b: _json_response(
            200,
            {
                "authenticated": True,
                "reason": None,
                "preferred_network_id": NETWORK_ID,
                "user_email": "sarah@example.com",
                "user_name": "Sarah Example",
                "user_phone": "+15555550123",
                "user_role": "owner",
                "account_id": "acct-maple",
                "premium_status": "active",
            },
        ),
    ),
    (
        "GET",
        "/api/networks",
        lambda p, q, b: _json_response(200, FIXTURES["network_summary"]),
    ),
    (
        "GET",
        "/api/networks/{network_id}",
        lambda p, q, b: _json_response(200, FIXTURES["network_detail"]),
    ),
    (
        "GET",
        "/api/networks/{network_id}/entitlements",
        lambda p, q, b: _json_response(
            200,
            {
                "features": [
                    "ad_blocking",
                    "content_filter",
                    "dynamic_dns",
                    "internet_backup",
                    "premium_dns",
                ],
                "upsell_features": [],
                "is_premium": True,
                "premium_status": {
                    "active": True,
                    "eero_plus": True,
                    "premium_dns": True,
                },
                "capabilities": ["sqm", "wpa3", "block_apps", "thread", "mlo"],
                "experimental_writes": True,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/speedtests",
        lambda p, q, b: _json_response(
            200, SPEEDTESTS[: int((q.get("limit") or ["1"])[0])]
        ),
    ),
    (
        "POST",
        "/api/networks/{network_id}/speedtest",
        lambda p, q, b: _json_response(
            202, {"status": "started", "started_at": _iso(NOW)}
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/dns",
        lambda p, q, b: _json_response(
            200,
            {
                "ipv4": {"mode": "custom", "servers": ["1.1.1.1", "1.0.0.1"]},
                "ipv6": {
                    "mode": "custom",
                    "servers": ["2606:4700:4700::1111", "2606:4700:4700::1001"],
                },
                "caching": True,
                "parent_ips": ["203.0.113.42"],
                "providers": [
                    {
                        "name": "Cloudflare",
                        "ipv4": ["1.1.1.1", "1.0.0.1"],
                        "ipv6": ["2606:4700:4700::1111", "2606:4700:4700::1001"],
                    },
                    {
                        "name": "Google",
                        "ipv4": ["8.8.8.8", "8.8.4.4"],
                        "ipv6": ["2001:4860:4860::8888", "2001:4860:4860::8844"],
                    },
                    {
                        "name": "OpenDNS",
                        "ipv4": ["208.67.222.222", "208.67.220.220"],
                        "ipv6": [],
                    },
                    {
                        "name": "Quad9",
                        "ipv4": ["9.9.9.9", "149.112.112.112"],
                        "ipv6": ["2620:fe::fe", "2620:fe::9"],
                    },
                ],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/guest",
        lambda p, q, b: _json_response(
            200,
            {
                "enabled": True,
                "name": "Maple Street Guest",
                "has_password": True,
            },
        ),
    ),
    ("GET", "/api/networks/{network_id}/insights", _route_insights),
    ("GET", "/api/devices/{device_id}/insights", _route_insights),
    ("GET", "/api/profiles/{profile_id}/insights", _route_insights),
    ("GET", "/api/networks/{network_id}/data-usage", _route_data_usage),
    (
        "GET",
        "/api/networks/{network_id}/data-usage/breakdown",
        lambda p, q, b: _json_response(
            200,
            {
                "download_bytes": None,
                "upload_bytes": None,
                "values": [
                    {
                        "category": "streaming",
                        "download": 19_000_000_000,
                        "upload": 400_000_000,
                    },
                    {
                        "category": "gaming",
                        "download": 8_200_000_000,
                        "upload": 1_900_000_000,
                    },
                    {
                        "category": "browsing",
                        "download": 4_100_000_000,
                        "upload": 600_000_000,
                    },
                    {
                        "category": "smart_home",
                        "download": 900_000_000,
                        "upload": 700_000_000,
                    },
                ],
                "raw": {},
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/data-usage/devices",
        lambda p, q, b: _json_response(
            200,
            {
                "download_bytes": None,
                "upload_bytes": None,
                "values": [
                    {
                        "mac": d["mac"],
                        "nickname": d["nickname"],
                        "download": 300_000_000 * (i + 1),
                        "upload": 20_000_000 * (i + 1),
                    }
                    for i, d in enumerate(DEVICES[:8])
                ],
                "raw": {},
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/data-usage/devices/{mac}",
        _usage_route("device", "mac"),
    ),
    ("GET", "/api/networks/{network_id}/data-usage/eeros/summary", _route_data_usage),
    (
        "GET",
        "/api/networks/{network_id}/data-usage/eeros/{eero_id}",
        _usage_route("eero", "eero_id"),
    ),
    (
        "GET",
        "/api/networks/{network_id}/data-usage/profiles/{profile_id}",
        _usage_route("profile", "profile_id"),
    ),
    ("GET", "/api/networks/{network_id}/events", _route_events),
    (
        "GET",
        "/api/networks/{network_id}/channel-utilization",
        _route_channel_utilization,
    ),
    (
        "GET",
        "/api/networks/{network_id}/permissions",
        lambda p, q, b: _json_response(
            200,
            {
                "permissions": {"can_manage_devices": True, "can_manage_members": True},
                "role": "owner",
                "partial": False,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/members",
        lambda p, q, b: _json_response(
            200,
            {
                "members": [
                    {"name": "Sarah Example", "role": "owner", "status": "active"},
                    {"name": "Mark Example", "role": "member", "status": "active"},
                ],
                "partial": False,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/invites",
        lambda p, q, b: _json_response(
            200,
            {
                "invites": [
                    {
                        "id": "invite-1",
                        "role": "member",
                        "status": "pending",
                        "created": _iso(NOW - timedelta(days=2)),
                        "expires": _iso(NOW + timedelta(days=5)),
                    },
                ],
                "partial": False,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/backup-internet",
        lambda p, q, b: _json_response(
            200,
            {
                "enabled": True,
                "cellular_usage": {
                    "used_bytes": 1_200_000_000,
                    "limit_bytes": 10_000_000_000,
                },
                "cellular_events": [
                    {
                        "timestamp": _iso(NOW - timedelta(days=4)),
                        "type": "failover_started",
                    }
                ],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/backup-access-points",
        lambda p, q, b: _json_response(
            200,
            {
                "access_points": [
                    {
                        "id": "ap-1",
                        "ssid": "Example-Fiber-Backup",
                        "uuid": "uuid-backup-1",
                        "priority": 1,
                        "enabled": True,
                        "status": "active",
                        "connectivity": {"signal": "good"},
                    },
                ],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/security",
        lambda p, q, b: _json_response(
            200,
            {
                "wpa3": True,
                "band_steering": True,
                "upnp": False,
                "ipv6": {"name_servers": {"mode": "automatic"}},
                "ipv6_enabled": True,
                "wpa3_per_band": {
                    "band_2_4_ghz": True,
                    "band_5_ghz": True,
                    "band_6_ghz": True,
                },
                "fast_transition": {"enabled": True},
                "sqm": False,
                "thread": {
                    "enabled": True,
                    "name": "maple-thread",
                    "channel": 15,
                    "pan_id": "0xACDC",
                },
                "updates": {"has_update": False},
                "passpoint": False,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/subnets",
        lambda p, q, b: _json_response(
            200,
            {
                "subnets": [
                    {
                        "subnet_type": "main",
                        "name": "Maple Street",
                        "enabled": True,
                        "open_network": False,
                        "wan_access": True,
                        "cidr": "192.168.4.0/22",
                    },
                    {
                        "subnet_type": "guest",
                        "name": "Maple Street Guest",
                        "enabled": True,
                        "open_network": False,
                        "wan_access": True,
                        "cidr": "192.168.8.0/24",
                    },
                    {
                        "subnet_type": "iot",
                        "name": "Maple Street IoT",
                        "enabled": True,
                        "open_network": False,
                        "wan_access": False,
                        "cidr": "192.168.9.0/24",
                    },
                ],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/multistaticip",
        lambda p, q, b: _json_response(
            200,
            {
                "configured": False,
                "config": None,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/advanced",
        lambda p, q, b: _json_response(
            200,
            {
                "dhcp": {
                    "mode": "custom",
                    "starting_address": "192.168.4.10",
                    "ending_address": "192.168.7.250",
                    "subnet_mask": "255.255.252.0",
                    "subnet_ip": "192.168.4.1",
                    "lease_time_seconds": 86400,
                },
                "connection_mode": "NAT",
                "power_saving": False,
                "ddns": {"enabled": False, "subdomain": ""},
                "nat_port_randomization": False,
                "mlo_mode": "multi",
                "proxied_nodes_enabled": None,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/notifications",
        lambda p, q, b: _json_response(
            200,
            {
                "settings": {
                    "device_connected": True,
                    "device_disconnected": False,
                    "guest_joined": True,
                },
                "has_unread": True,
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/notifications/history",
        lambda p, q, b: _json_response(
            200,
            {
                "history": [
                    {
                        "timestamp": _iso(NOW - timedelta(hours=2)),
                        "message": "Sarah's iPhone 16 connected",
                    },
                    {
                        "timestamp": _iso(NOW - timedelta(hours=20)),
                        "message": "Firmware check completed",
                    },
                    {
                        "timestamp": _iso(NOW - timedelta(days=2)),
                        "message": "Guest Phone joined the guest network",
                    },
                ],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/forwards",
        lambda p, q, b: _json_response(
            200,
            {
                "forwards": [
                    {
                        "id": "fwd-1",
                        "client_port": 8080,
                        "gateway_port": 80,
                        "ip": "192.168.4.40",
                        "protocol": "tcp",
                        "description": "Home web server",
                        "enabled": True,
                    },
                    {
                        "id": "fwd-2",
                        "client_port": 51820,
                        "gateway_port": 51820,
                        "ip": "192.168.4.41",
                        "protocol": "udp",
                        "description": "VPN",
                        "enabled": True,
                    },
                ],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/reservations",
        lambda p, q, b: _json_response(
            200,
            {
                "reservations": [
                    {
                        "id": "res-1",
                        "ip": "192.168.4.40",
                        "mac": "02:00:00:bb:00:15",
                        "description": "Printer",
                        "public_static_ip": None,
                    },
                    {
                        "id": "res-2",
                        "ip": "192.168.4.41",
                        "mac": "02:00:00:bb:00:18",
                        "description": "Network Storage",
                        "public_static_ip": None,
                    },
                ],
            },
        ),
    ),
    ("GET", "/api/devices", lambda p, q, b: _json_response(200, FIXTURES["devices"])),
    (
        "GET",
        "/api/devices/{device_id}",
        lambda p, q, b: _json_response(
            200,
            FIXTURES["device_details"].get(
                p["device_id"], FIXTURES["device_details"]["d01"]
            ),
        ),
    ),
    ("GET", "/api/eeros", lambda p, q, b: _json_response(200, FIXTURES["eeros"])),
    (
        "GET",
        "/api/eeros/{eero_id}",
        lambda p, q, b: _json_response(
            200,
            FIXTURES["eero_details"].get(p["eero_id"], FIXTURES["eero_details"]["e1"]),
        ),
    ),
    ("GET", "/api/eeros/{eero_id}/connections", _route_eero_connections),
    ("GET", "/api/profiles", lambda p, q, b: _json_response(200, FIXTURES["profiles"])),
    (
        "GET",
        "/api/profiles/{profile_id}",
        lambda p, q, b: _json_response(
            200,
            next(
                (pr for pr in FIXTURES["profiles"] if pr["id"] == p["profile_id"]),
                FIXTURES["profiles"][0],
            ),
        ),
    ),
    (
        "GET",
        "/api/metrics/roaming",
        lambda p, q, b: _json_response(200, FIXTURES["roaming"]),
    ),
    (
        "GET",
        "/api/networks/{network_id}/content-filter",
        lambda p, q, b: _json_response(
            200,
            {
                "allowed_list": ["example-homework.example.com"],
                "blocked_list": ["ads.example-tracker.com"],
            },
        ),
    ),
    (
        "GET",
        "/api/profiles/{profile_id}/schedules",
        lambda p, q, b: _json_response(200, []),
    ),
    (
        "GET",
        "/api/profiles/{profile_id}/blocked-applications",
        lambda p, q, b: _json_response(
            200, {"applications": ["com.example.socialapp"]}
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/power-saving/schedules",
        lambda p, q, b: _json_response(
            200,
            {
                "schedules": [],
            },
        ),
    ),
    (
        "GET",
        "/api/networks/{network_id}/scan",
        lambda p, q, b: _json_response(
            200,
            {
                "scan": [
                    {
                        "channel": 1,
                        "band": "2.4GHz",
                        "ssid": "Birch-Court-WiFi",
                        "rssi": -72,
                    },
                    {
                        "channel": 6,
                        "band": "2.4GHz",
                        "ssid": "Example-Neighbors-2G",
                        "rssi": -68,
                    },
                    {
                        "channel": 44,
                        "band": "5GHz",
                        "ssid": "Birch-Court-WiFi-5G",
                        "rssi": -65,
                    },
                    {
                        "channel": 149,
                        "band": "5GHz",
                        "ssid": "Example-Guest-5G",
                        "rssi": -80,
                    },
                ],
            },
        ),
    ),
    ("GET", "/api/metrics/speedtest/history", _route_speedtest_history),
    ("GET", "/api/metrics/devices/{device_id}/signal", _route_device_signal_history),
    ("GET", "/api/metrics/network/client_count", _route_client_count_history),
]

# Generic fallback for write/action endpoints the screenshot flows don't
# exercise (no button clicks happen during capture) but which the frontend
# may still probe defensively. Keeps the "zero unhandled requests" guarantee
# without hand-fixturing every POST/PUT/DELETE in the API surface.
_WRITE_FALLBACKS: list[tuple[str, str]] = [
    ("POST", "/api/*"),
    ("PUT", "/api/*"),
    ("DELETE", "/api/*"),
    ("PATCH", "/api/*"),
]


def _compile_route(template: str) -> re.Pattern[str]:
    pattern = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", template)
    return re.compile(f"^{pattern}$")


_COMPILED_ROUTES = [
    (method, _compile_route(tmpl), handler) for method, tmpl, handler in ROUTES
]


@dataclass
class DispatchResult:
    status: int
    body: Any
    matched: bool


def dispatch(
    method: str, path: str, query: dict[str, list[str]], body: Any
) -> DispatchResult:
    for route_method, pattern, handler in _COMPILED_ROUTES:
        if route_method != method:
            continue
        match = pattern.match(path)
        if match:
            status, result = handler(match.groupdict(), query, body)
            return DispatchResult(status=status, body=result, matched=True)
    if method in ("POST", "PUT", "DELETE", "PATCH") and path.startswith("/api/"):
        # Generic success fallback for un-fixtured writes (not exercised by
        # any screenshot flow - see _WRITE_FALLBACKS above).
        return DispatchResult(
            status=200, body={"success": True, "changed": True}, matched=True
        )
    return DispatchResult(
        status=404, body={"detail": "unhandled fixture route"}, matched=False
    )


# ---------------------------------------------------------------------------
# Static file server for frontend/build with SPA fallback to index.html,
# mirroring `vite preview`'s behaviour for this adapter-static project.
# ---------------------------------------------------------------------------


def _make_spa_handler(build_dir: Path) -> type[http.server.BaseHTTPRequestHandler]:
    class SpaHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(build_dir), **kwargs)

        def log_message(self, fmt: str, *args: Any) -> None:
            pass

        def translate_path(self, path: str) -> str:
            path = path.split("?", 1)[0]
            candidate = Path(super().translate_path(path))
            if candidate.is_file():
                return str(candidate)
            return str(build_dir / "index.html")

    return SpaHandler


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


def start_static_server(build_dir: Path) -> tuple[http.server.ThreadingHTTPServer, int]:
    port = _free_port()
    handler = _make_spa_handler(build_dir)
    server = http.server.ThreadingHTTPServer(("localhost", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port


# ---------------------------------------------------------------------------
# Screenshot capture
# ---------------------------------------------------------------------------

# (name, path, tab_label_to_click_or_None, extra_action)
CAPTURES: list[dict[str, Any]] = [
    {"name": "dashboard", "path": "/"},
    {"name": "devices", "path": "/devices"},
    {"name": "device-detail", "path": "/devices/d01"},
    {"name": "eeros", "path": "/eeros"},
    {"name": "eero-detail", "path": "/eeros/e1"},
    {"name": "network-overview", "path": f"/network/{NETWORK_ID}", "tab": "Overview"},
    {"name": "network-advanced", "path": f"/network/{NETWORK_ID}", "tab": "Advanced"},
    {
        "name": "network-diagnostics",
        "path": f"/network/{NETWORK_ID}",
        "tab": "Diagnostics",
    },
    {"name": "topology", "path": "/topology"},
]

MOBILE_CAPTURES: list[dict[str, Any]] = [
    {"name": "dashboard", "path": "/"},
]

VIEWPORT_DESKTOP = {"width": 1440, "height": 900}
VIEWPORT_MOBILE = {"width": 390, "height": 844}
MAX_CAPTURE_HEIGHT = 1800
THEME_INIT_SCRIPT = """
(theme) => {
  localStorage.setItem('eero-ui-theme', theme);
}
"""


def _run_captures(base_url: str, out_dir: Path) -> list[Path]:
    from playwright.sync_api import sync_playwright

    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    unhandled: list[str] = []
    console_errors: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=CHROMIUM_PATH,
            args=["--no-sandbox", "--disable-gpu"],
        )
        try:
            for theme in ("dark", "light"):
                for viewport, captures, suffix in (
                    (VIEWPORT_DESKTOP, CAPTURES, 1440),
                    (VIEWPORT_MOBILE, MOBILE_CAPTURES, 390),
                ):
                    if suffix == 390 and theme == "light":
                        continue  # one mobile shot is enough (task: "at minimum ... one 390px mobile shot")
                    context = browser.new_context(
                        viewport=viewport,
                        reduced_motion="reduce",
                        color_scheme=theme,
                    )
                    fixed_now_ms = int(NOW.timestamp() * 1000)
                    context.add_init_script(
                        f"localStorage.setItem('eero-ui-theme', '{theme}');"
                    )
                    # Freeze the browser clock at NOW so every chart that
                    # computes its own start/end window (signal history,
                    # speedtest history, client count) is reproducible
                    # run-to-run, not just the Python-side fixtures.
                    context.add_init_script(
                        f"""
                        (() => {{
                          const FIXED = {fixed_now_ms};
                          const RealDate = Date;
                          class FixedDate extends RealDate {{
                            constructor(...args) {{
                              if (args.length === 0) {{
                                super(FIXED);
                              }} else {{
                                super(...args);
                              }}
                            }}
                            static now() {{
                              return FIXED;
                            }}
                          }}
                          window.Date = FixedDate;
                        }})();
                        """
                    )

                    def _route_handler(route, request):
                        from urllib.parse import parse_qs, urlparse

                        parsed = urlparse(request.url)
                        query = parse_qs(parsed.query)
                        body = None
                        if request.method in ("POST", "PUT", "PATCH"):
                            try:
                                body = request.post_data_json
                            except Exception:  # noqa: BLE001 - best-effort only
                                body = None
                        result = dispatch(request.method, parsed.path, query, body)
                        if not result.matched:
                            unhandled.append(f"{request.method} {parsed.path}")
                        route.fulfill(
                            status=result.status,
                            content_type="application/json",
                            body=json.dumps(result.body),
                        )

                    context.route("**/api/**", _route_handler)
                    page = context.new_page()
                    page.on(
                        "console",
                        lambda msg: (
                            console_errors.append(msg.text)
                            if msg.type == "error"
                            else None
                        ),
                    )
                    page.on("pageerror", lambda exc: console_errors.append(str(exc)))

                    for capture in captures:
                        page.goto(
                            f"{base_url}{capture['path']}", wait_until="networkidle"
                        )
                        if capture.get("tab"):
                            page.get_by_role(
                                "tab", name=capture["tab"], exact=True
                            ).click()
                            page.wait_for_load_state("networkidle")
                        page.wait_for_timeout(400)
                        filename = f"{capture['name']}--{theme}--{suffix}.png"
                        dest = out_dir / filename
                        # Cap long pages at MAX_CAPTURE_HEIGHT rather than a
                        # fixed viewport screenshot (which cuts mid-card) or
                        # an unbounded full_page screenshot (some pages run
                        # to several thousand px - not README hero material).
                        # `clip` alone only trims the *current* viewport
                        # screenshot, so the viewport itself is resized to
                        # the target height first, then restored.
                        full_height = page.evaluate("document.body.scrollHeight")
                        capture_height = min(
                            max(full_height, viewport["height"]), MAX_CAPTURE_HEIGHT
                        )
                        if capture_height != viewport["height"]:
                            page.set_viewport_size(
                                {"width": viewport["width"], "height": capture_height}
                            )
                            page.wait_for_timeout(150)
                        page.screenshot(path=str(dest))
                        if capture_height != viewport["height"]:
                            page.set_viewport_size(viewport)
                        written.append(dest)

                    context.close()
        finally:
            browser.close()

    if unhandled:
        print("ERROR: unhandled /api requests during capture:", file=sys.stderr)
        for u in sorted(set(unhandled)):
            print(f"  {u}", file=sys.stderr)
        raise SystemExit(1)
    if console_errors:
        print("ERROR: console/page errors during capture:", file=sys.stderr)
        for e in console_errors:
            print(f"  {e}", file=sys.stderr)
        raise SystemExit(1)

    return written


def cmd_fixtures(_args: argparse.Namespace) -> None:
    print(json.dumps(FIXTURES, indent=2, default=str))


def cmd_build(_args: argparse.Namespace) -> None:
    frontend_dir = REPO_ROOT / "frontend"
    subprocess.run(["npx", "svelte-kit", "sync"], cwd=frontend_dir, check=True)
    subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)


def cmd_shots(args: argparse.Namespace) -> None:
    build_dir = Path(args.build_dir)
    if not (build_dir / "index.html").exists():
        print(
            f"error: {build_dir}/index.html not found - run `build` first",
            file=sys.stderr,
        )
        raise SystemExit(1)
    out_dir = Path(args.out)
    server, port = start_static_server(build_dir)
    try:
        base_url = f"http://localhost:{port}"
        # Give the server a beat to be reachable.
        for _ in range(20):
            try:
                urllib.request.urlopen(base_url, timeout=1)
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.25)
        written = _run_captures(base_url, out_dir)
    finally:
        server.shutdown()
    print(f"Wrote {len(written)} images to {out_dir}:")
    for path in written:
        size_kb = path.stat().st_size / 1024
        print(f"  {path.name}  ({size_kb:.0f} KB)")


def cmd_all(args: argparse.Namespace) -> None:
    cmd_build(args)
    cmd_shots(args)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_fixtures = sub.add_parser("fixtures", help="Dump the synthetic fixtures as JSON")
    p_fixtures.set_defaults(func=cmd_fixtures)

    p_build = sub.add_parser("build", help="npm run build the frontend")
    p_build.set_defaults(func=cmd_build)

    p_shots = sub.add_parser("shots", help="Serve the build and capture screenshots")
    p_shots.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    p_shots.add_argument("--out", default=str(DEFAULT_OUT_DIR))
    p_shots.set_defaults(func=cmd_shots)

    p_all = sub.add_parser("all", help="build then shots")
    p_all.add_argument("--build-dir", default=str(DEFAULT_BUILD_DIR))
    p_all.add_argument("--out", default=str(DEFAULT_OUT_DIR))
    p_all.set_defaults(func=cmd_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
