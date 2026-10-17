"""Persist MQTT settings and publish collected metrics with HA discovery."""

import asyncio
import hashlib
import json
import logging
import math
import os
import re
import tempfile
import threading
import time
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

import paho.mqtt.client as mqtt
from paho.mqtt.reasoncodes import ReasonCode
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from .victoria import Sample
from .wan import EXPIRY_SECONDS as WAN_EXPIRY

_SENSORS = {
    "wired_clients": ("Wired clients", "mdi:ethernet", None),
    "wireless_clients": ("Wireless clients", "mdi:wifi", None),
    "download_mbps": ("Latest speed test download", "mdi:download", "Mbit/s"),
    "upload_mbps": ("Latest speed test upload", "mdi:upload", "Mbit/s"),
    "wan_download_mbps": ("WAN download", "mdi:download-network", "Mbit/s"),
    "wan_upload_mbps": ("WAN upload", "mdi:upload-network", "Mbit/s"),
}
_LOGGER = logging.getLogger(__name__)


def parse_broker_address(address: str) -> tuple[str, int, bool]:
    """Accept a host[:port] or mqtt(s) URL, without embedded credentials."""
    try:
        parsed = urlsplit(address if "://" in address else f"mqtt://{address}")
        tls = parsed.scheme == "mqtts"
        if (
            parsed.scheme not in ("mqtt", "mqtts")
            or not parsed.hostname
            or any(c.isspace() for c in parsed.hostname)
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError
        port = parsed.port if parsed.port is not None else (8883 if tls else 1883)
        if not 1 <= port <= 65535:
            raise ValueError
        return parsed.hostname, port, tls
    except ValueError as exc:
        raise ValueError(
            "Use a broker hostname, host:port, or mqtt(s)://host:port."
        ) from exc


class MQTTSettingsUpdate(BaseModel):
    """A null password preserves the saved secret; an empty one clears it."""

    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    broker_address: str = Field(default="", max_length=512)
    username: str = Field(default="", max_length=256)
    password: SecretStr | None = Field(default=None, max_length=4096)
    home_assistant_discovery: bool = True
    discovery_prefix: str = Field(default="homeassistant", max_length=128)

    @field_validator("broker_address")
    @classmethod
    def valid_address(cls, value: str) -> str:
        """Trim the broker address and validate its scheme, host and optional port."""
        value = value.strip()
        if value:
            parse_broker_address(value)
        return value

    @field_validator("discovery_prefix")
    @classmethod
    def valid_prefix(cls, value: str) -> str:
        """Normalize the discovery prefix and reject spaces or MQTT wildcards."""
        value = value.strip().strip("/")
        if (
            not value
            or any(c in value for c in "+#\x00")
            or any(c.isspace() for c in value)
        ):
            raise ValueError(
                "Enter a discovery prefix without spaces or MQTT wildcards."
            )
        return value


def _new_instance_id() -> str:
    """Create a stable-format identifier for a new MQTT installation."""
    return uuid4().hex


class MQTTSettings(MQTTSettingsUpdate):
    """Persist broker settings, the saved secret and a stable installation identifier."""

    password: SecretStr = SecretStr("")
    instance_id: str = Field(
        default_factory=_new_instance_id, pattern=r"^[a-f0-9]{32}$"
    )


class MQTTStatus(BaseModel):
    """Expose broker configuration and connection state with only a password-set flag."""

    enabled: bool
    broker_address: str
    username: str
    password_set: bool
    home_assistant_discovery: bool
    discovery_prefix: str
    connection_status: Literal["disabled", "connecting", "connected", "error"]
    message: str | None


def load_settings(path: Path) -> MQTTSettings:
    """Load persisted settings or disabled defaults; reject enabled MQTT with no broker."""
    if not path.exists():
        return MQTTSettings()
    config = MQTTSettings.model_validate_json(path.read_text(encoding="utf-8"))
    if config.enabled and not config.broker_address:
        raise ValueError("Enabled MQTT requires a broker address.")
    return config


def save_settings(path: Path, config: MQTTSettings) -> None:
    """Write atomically with owner-only permissions on POSIX systems."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = config.model_dump(mode="json")
    payload["password"] = config.password.get_secret_value()
    fd, temporary = tempfile.mkstemp(prefix=".mqtt-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class MQTTService:
    """Paho owns its network thread; callbacks and collection share a lock.

    Publishes network metrics and live WAN totals with Home Assistant discovery.
    Client addresses and credentials are never included in MQTT payloads.
    """

    def __init__(self, path: Path, interval_seconds: int = 60) -> None:
        """Load settings and initialize thread-safe connection state and metric caches."""
        self.path = path
        self.config = load_settings(path)
        self._expiry = max(60, interval_seconds * 3)
        self._lock = threading.RLock()
        self._update_lock = asyncio.Lock()
        self._client: mqtt.Client | None = None
        self._status = "disabled"
        self._message: str | None = None
        self._snapshots: dict[str, dict] = {}
        self._snapshot_at = 0.0
        self._announced: dict[str, str] = {}

    @property
    def base_topic(self) -> str:
        """Return the installation-specific namespace shared by state and availability."""
        return f"eero_ui/{self.config.instance_id}"

    def status(self) -> MQTTStatus:
        """Snapshot public settings and connection state while holding the shared lock."""
        with self._lock:
            return MQTTStatus(
                **self.config.model_dump(exclude={"password", "instance_id"}),
                password_set=bool(self.config.password.get_secret_value()),
                connection_status=self._status,
                message=self._message,
            )

    def start(self) -> None:
        """Start asynchronous broker connection and reconnection when MQTT is enabled."""
        with self._lock:
            if not self.config.enabled or self._client is not None:
                return
            host, port, tls = parse_broker_address(self.config.broker_address)
            client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"eero-ui-{self.config.instance_id}",
            )
            self._client = client
            self._status, self._message = "connecting", None
            client.on_connect = self._on_connect
            client.on_connect_fail = self._on_connect_fail
            client.on_disconnect = self._on_disconnect
            client.on_message = self._on_message
            client.reconnect_delay_set(min_delay=1, max_delay=60)
            client.max_queued_messages_set(256)
            client.will_set(
                f"{self.base_topic}/availability", "offline", qos=1, retain=True
            )
            if self.config.username:
                client.username_pw_set(
                    self.config.username, self.config.password.get_secret_value()
                )
            if tls:
                client.tls_set()
            client.connect_async(host, port, keepalive=60)
            client.loop_start()

    async def update(self, update: MQTTSettingsUpdate) -> MQTTStatus:
        """Persist settings, preserve an omitted password and reconnect with the new values."""
        async with self._update_lock:
            payload = update.model_dump(exclude={"password"})
            config = MQTTSettings(
                **payload,
                password=(
                    update.password
                    if update.password is not None
                    else self.config.password
                ),
                instance_id=self.config.instance_id,
            )
            if config.enabled and not config.broker_address:
                raise ValueError("Enter a broker address before enabling MQTT.")
            await asyncio.to_thread(save_settings, self.path, config)
            # Remove retained discovery if disabled or its prefix changes.
            remove_discovery = self.config.home_assistant_discovery and (
                not config.home_assistant_discovery
                or config.discovery_prefix != self.config.discovery_prefix
            )
            await asyncio.to_thread(self._stop, remove_discovery)
            with self._lock:
                self.config = config
            await asyncio.to_thread(self.start)
            return self.status()

    async def close(self) -> None:
        """Serialize shutdown with settings updates and stop the broker network thread."""
        async with self._update_lock:
            await asyncio.to_thread(self._stop)

    def _stop(self, remove_discovery: bool = False) -> None:
        """Publish offline, optionally clear discovery and stop the client outside the lock."""
        with self._lock:
            client = self._client
            if client is None:
                return
            messages = []
            if client.is_connected():
                if remove_discovery:
                    for network_id in self._snapshots:
                        for key in _SENSORS:
                            messages.append(
                                client.publish(
                                    self._discovery_topic(network_id, key),
                                    "",
                                    qos=1,
                                    retain=True,
                                )
                            )
                messages.append(
                    client.publish(
                        f"{self.base_topic}/availability", "offline", qos=1, retain=True
                    )
                )
            self._client = None
            self._status, self._message = "disabled", None
            self._announced.clear()
        # Waiting inside a callback or while holding the lock would deadlock.
        deadline = time.monotonic() + 3
        for message in messages:
            try:
                message.wait_for_publish(timeout=max(0.01, deadline - time.monotonic()))
            except (RuntimeError, ValueError):
                break
        client.disconnect()
        client.loop_stop()

    def _on_connect(
        self, client, _userdata, _flags, reason_code: ReasonCode, _properties
    ) -> None:
        """Handle the current client's CONNACK and republish discovery on success."""
        with self._lock:
            if client is not self._client:
                return
            if reason_code != 0:
                self._status, self._message = (
                    "error",
                    "Broker rejected the connection. Check your credentials and broker permissions.",
                )
                return
            self._status, self._message = "connected", None
            self._announced.clear()
            if self.config.home_assistant_discovery:
                client.subscribe(f"{self.config.discovery_prefix}/status", qos=1)
            self._publish_snapshot()

    def _on_connect_fail(self, client, _userdata) -> None:
        """Report a connection failure without exposing credentials or transport errors."""
        with self._lock:
            if client is self._client:
                self._status, self._message = (
                    "error",
                    "Cannot reach the broker. Check its address, port and TLS settings. Retrying automatically.",
                )

    def _on_disconnect(
        self, client, _userdata, _flags, _reason_code, _properties
    ) -> None:
        """Mark the current connection as retrying while preserving rejection errors."""
        with self._lock:
            if client is self._client:
                if self._status == "error":
                    return
                self._status, self._message = (
                    "connecting",
                    "Connection lost. Retrying automatically.",
                )

    def _on_message(self, client, _userdata, message) -> None:
        """Reannounce cached discovery and states when Home Assistant comes online."""
        with self._lock:
            if client is not self._client:
                return
            if (
                client is self._client
                and message.topic == f"{self.config.discovery_prefix}/status"
                and message.payload == b"online"
            ):
                self._announced.clear()
                self._publish_snapshot()

    def publish_samples(self, samples: list[Sample]) -> None:
        """Use the collector's normalized samples, including empty device lists."""
        snapshots: dict[str, dict] = {}
        for sample in samples:
            network_id = sample.labels.get("network_id")
            if not network_id:
                continue
            snapshot = snapshots.setdefault(
                network_id,
                {
                    "name": self._snapshots.get(network_id, {}).get(
                        "name", "Eero network"
                    ),
                    "values": {},
                },
            )
            self._update_snapshot_values(snapshot, sample, samples)
        with self._lock:
            for network_id, previous in self._snapshots.items():
                snapshots.setdefault(
                    network_id, {"name": previous["name"], "values": {}}
                )
            self._snapshots = snapshots
            self._snapshot_at = time.monotonic()
            if self._client and self._client.is_connected():
                self._publish_snapshot()

    @staticmethod
    def _update_snapshot_values(
        snapshot: dict, sample: Sample, samples: list[Sample]
    ) -> None:
        """Merge a sample into network counts, valid rates and WAN observation time."""
        values = snapshot["values"]
        if sample.name == "eero_network_clients_count":
            snapshot["name"] = sample.labels.get("name") or "Eero network"
            for connection in ("wired", "wireless"):
                values[f"{connection}_clients"] = sum(
                    1
                    for device in samples
                    if device.name == "eero_device_connected"
                    and device.labels.get("network_id") == sample.labels["network_id"]
                    and device.labels.get("connection_type") == connection
                    and device.value == 1
                )
        elif sample.name in (
            "eero_network_wan_download_mbps",
            "eero_network_wan_upload_mbps",
        ):
            if math.isfinite(sample.value) and sample.value >= 0:
                values[sample.name.removeprefix("eero_network_")] = sample.value
                snapshot["wan_observed_at"] = sample.timestamp_ms / 1000
        elif sample.name in ("eero_speed_download_mbps", "eero_speed_upload_mbps"):
            if math.isfinite(sample.value) and sample.value >= 0:
                key = (
                    "download_mbps"
                    if sample.name == "eero_speed_download_mbps"
                    else "upload_mbps"
                )
                values[key] = sample.value

    def _network_key(self, network_id: str) -> str:
        """Hash a network identifier into a stable topic segment without exposing its ID."""
        return hashlib.sha256(network_id.encode()).hexdigest()[:16]

    def _discovery_topic(self, network_id: str, key: str) -> str:
        """Return the retained discovery topic for one installation, network and sensor."""
        return f"{self.config.discovery_prefix}/sensor/eero_ui_{self.config.instance_id}_{self._network_key(network_id)}/{key}/config"

    def _discovery_payload(self, network_id: str, key: str, snapshot: dict) -> dict:
        """Describe a Home Assistant sensor with stable identity, units and expiry."""
        network_key = self._network_key(network_id)
        topic = f"{self.base_topic}/{network_key}"
        name, icon, unit = _SENSORS[key]
        payload = {
            "name": name,
            "unique_id": f"eero_ui_{self.config.instance_id}_{network_key}_{key}",
            "state_topic": f"{topic}/{key}/state",
            "availability_topic": f"{self.base_topic}/availability",
            "expire_after": WAN_EXPIRY if key.startswith("wan_") else self._expiry,
            "state_class": "measurement",
            "icon": icon,
            "device": {
                "identifiers": [f"eero_ui_{self.config.instance_id}_{network_key}"],
                "name": snapshot["name"],
                "manufacturer": "eero",
                "model": "Eero network",
            },
        }
        if unit:
            payload.update(
                unit_of_measurement=unit,
                device_class="data_rate",
                suggested_display_precision=1,
            )
        if key.startswith("wan_"):
            slug = re.sub(r"[^a-z0-9]+", "_", snapshot["name"].lower()).strip("_")
            payload["default_entity_id"] = f"sensor.{slug}_{key.removesuffix('_mbps')}"
        return payload

    def _publish_discovery(
        self, client: mqtt.Client, network_id: str, key: str, snapshot: dict
    ) -> None:
        """Retain discovery configuration when it changes or needs reannouncing."""
        topic = self._discovery_topic(network_id, key)
        encoded = json.dumps(self._discovery_payload(network_id, key, snapshot))
        if self._announced.get(topic) != encoded:
            info = client.publish(topic, encoded, qos=1, retain=True)
            if info.rc == mqtt.MQTT_ERR_SUCCESS:
                self._announced[topic] = encoded

    def _publish_snapshot(self) -> None:
        """Publish discovery, fresh sensor states and overall availability for each network."""
        client = self._client
        if client is None:
            return
        fresh = time.monotonic() - self._snapshot_at < self._expiry
        for network_id, snapshot in self._snapshots.items():
            network_key = self._network_key(network_id)
            topic = f"{self.base_topic}/{network_key}"
            for key in _SENSORS:
                if self.config.home_assistant_discovery:
                    self._publish_discovery(client, network_id, key, snapshot)
                value = snapshot["values"].get(key) if fresh else None
                if key.startswith("wan_") and not (
                    0 <= time.time() - snapshot.get("wan_observed_at", 0) < WAN_EXPIRY
                ):
                    value = None
                # HA's numeric sensors interpret 'None' as unknown, never as 0.
                client.publish(
                    f"{topic}/{key}/state",
                    "None" if value is None else str(value),
                    qos=1,
                    retain=True,
                )
        available = fresh and any(
            snapshot["values"] for snapshot in self._snapshots.values()
        )
        client.publish(
            f"{self.base_topic}/availability",
            "online" if available else "offline",
            qos=1,
            retain=True,
        )
