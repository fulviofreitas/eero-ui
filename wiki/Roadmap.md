# 🗺️ Roadmap

## Planned Features

- [ ] WebSocket support for real-time updates
- [ ] Multi-account support
- [ ] Custom themes
- [ ] Making the embedded VictoriaMetrics optional when `EERO_DASHBOARD_VICTORIA_METRICS_URL` points elsewhere
- [ ] Live verification of the settings-class write families, one at a time, so their gates can be opened individually

Shipped in 6.0: Svelte 5 runes migration, CSV/JSON/YAML device export, shared component primitives and `DataTable`, themed Chart.js, SVG icon set, skeleton loading, native metrics collector, eero-api v8, the WP6 read families (entitlements, insights, data usage, events, channel utilisation, members and invites, backup internet, security, subnets, WAN), and the gated write families below.

## Write verification status

"Verified" means the write was issued and the result was **read back** from the eero cloud and compared — never that the API returned 200. Writes that are not verified sit behind `EERO_DASHBOARD_EXPERIMENTAL_WRITES` (see [[Configuration]]); settings-class writes additionally carry the mesh-reboot confirmation.

### Operations that existed before 6.0

| Operation | Was | Now (eero-api v8) |
|---|---|---|
| Run speed test | untested | **verified** (202; result read from history) |
| Block device | untested | unverified (form `mac=`) — gated |
| Unblock device | untested | **verified** |
| Rename device | untested | **verified** |
| Reboot eero | untested | **verified** (target node only) |
| Pause / unpause profile | untested | unverified (SDK now warns) — gated |
| LED on / off | silently dead in v6/v7 | **verified** |
| Guest network enable / disable | — | **verified**; disconnects guest clients |
| Rename network | — | unverified; settings-class, assumed to reboot the mesh; not gated (predates the flag) |
| DNS settings | — | **live-verified to reboot every eero**; settings-class; not gated (predates the flag) |

### Verified writes (always available)

`set_led`, `set_led_brightness`, `set_device_type`, `set_device_nickname`, `unblock_device`, `set_guest_network`, `set_guest_password`, `clear_guest_password`, `run_speed_test`, `reboot_eero`, `pause_device`. These use the optimistic pattern with a confirmation only where destructive.

### Unverified, non-settings writes (gated)

Pessimistic UI, read-first with skip-when-unchanged, confirmation stating the action is not verified end-to-end, no automatic retry. None has been live-verified yet.

| Family | Routes |
|---|---|
| Block device | `POST /api/devices/{id}/block` |
| Profiles | create, rename, delete, assign devices, pause/unpause, schedules, bedtime, blocked applications |
| Eero location | `PUT /api/eeros/{id}/location` |
| Node / port actions | `POST /api/eeros/{id}/node-action`, `POST /api/eeros/{id}/ports/{n}/action` (`POWER_CYCLE_ALL_PORTS_AND_REBOOT` reboots the node) |
| Notifications | settings update, mark read |
| DDNS, backup internet toggle, Thread (enable, update, regenerate) | `PUT /api/networks/{id}/ddns`, `/backup-internet`, `/thread`, `POST .../thread/regenerate` |
| Backup access points | add, update, delete, reorder, discover, connectivity check |
| Port forwards, DHCP reservations | create, update, delete |
| Content filter | allow/block domain, network-wide and per profile |
| Members and invites | create/update/delete invite, promote member, remove admin, cancel pending admin |
| Account | name, consents; e-mail and phone (double-gated) |
| Power-saving schedules | create, update, delete |

### Settings-class writes (gated, reboot warning)

Every one of these is treated as rebooting every eero on the network (decision 5 of the 6.0 plan) and follows the DNS pattern: parsed-value no-op guard where a read source exists, blocking danger dialog, per-network `applying` lock, no polling. None has been live-verified except DNS; the "reboot observed" column in the context repo's ledger is empty for all of them.

| Family | Route | No-op guard |
|---|---|---|
| SQM | `PUT /api/networks/{id}/sqm` | yes |
| DHCP mode / lease range | `PUT /api/networks/{id}/dhcp` | yes (`custom_v2` not exposed) |
| Connection mode | `PUT /api/networks/{id}/connection-mode` | yes |
| NAT port randomization | `PUT /api/networks/{id}/nat-port-randomization` | best effort |
| WPA3 per band | `PUT /api/networks/{id}/wpa3` | yes |
| WPA3 / band steering / UPnP / IPv6 | `PUT /api/networks/{id}/security` (exactly one field per request) | yes |
| MLO | `PUT /api/networks/{id}/mlo` | best effort (no getter) |
| Fast transition | `PUT /api/networks/{id}/fast-transition` | yes |
| Passpoint | `PUT /api/networks/{id}/passpoint` | best effort |
| Proxied nodes | `PUT /api/networks/{id}/proxied-nodes` | none — always writes |
| Power saving | `PUT /api/networks/{id}/power-saving` | yes |
| Subnets | `PUT /api/networks/{id}/subnets`, `DELETE .../subnets/{type}` | yes |
| Multi-static IP, secondary WAN (bulk and per device) | `PUT /api/networks/{id}/multistaticip`, `/secondary-wan`, `PUT /api/devices/{id}/secondary-wan-access` | bulk: none |
| Firmware update apply | `POST /api/networks/{id}/updates/apply` | 409 `no_update_available` when nothing is pending |
| Network Wi-Fi password set / clear | `PUT`/`DELETE /api/networks/{id}/password` | none (API never returns it); disconnects every client rather than rebooting |

### Known no-op

`set_device_labels` returns 200 and never applies. It has no route and is never exposed.

## Known Issues

- Removed devices linger in instant metric queries for VictoriaMetrics' 5-minute lookback window.
- Renaming a device starts a new metric series (the `name` label changes); charts key on `device_id` so this is cosmetic in the store only.
- DNS and network rename predate the experimental-writes flag and are not behind it.

## Contributing

Want to help? Check out:

- [Open Issues](https://github.com/fulviofreitas/eero-ui/issues)
- [Pull Requests](https://github.com/fulviofreitas/eero-ui/pulls)
