# WAN throughput in Home Assistant

Enable MQTT and Home Assistant auto discovery in the dashboard's **MQTT** page,
and configure Home Assistant's MQTT integration to use the same broker.

Append the sequence item from [`wan-throughput.yaml`](wan-throughput.yaml) to
an existing view's `cards` list. It uses Home Assistant's built-in glance card.
Replace `sensor.home_wan_download` and `sensor.home_wan_upload` with the actual
entity IDs discovered for your eero network. No custom cards are required.

The WAN sensors show total Internet download and upload in Mbit/s, excluding
local LAN transfers. The collector requests a live report at most once a
minute per network, waits 12 seconds for counters, then reuses its normal
device-list read. For a single network with the default collection interval, updates
arrive about every 72 seconds. No speed test is started.

Missing or incomplete usage, failed reporting, and bridge mode show unknown.
Readings expire after 90 seconds. Only the two network totals are published;
no per-client throughput entities or additional eero credentials are needed.
See [MQTT setup](../../wiki/Configuration.md#mqtt-and-home-assistant) for broker
settings, topics, credentials, and sensor availability.
