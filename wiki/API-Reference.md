# 📡 API Reference

The backend exposes these REST endpoints. Full interactive docs are available at `/api/docs` in debug mode.

Conventions that apply to every route below:

- **Auth** — every route requires an authenticated dashboard session unless marked *no*. An unauthenticated call gets `401`; a session the eero cloud has rejected gets `401 {"reason": "expired"}` and the stored token is cleared.
- **CSRF** — every `POST`/`PUT`/`PATCH`/`DELETE` under `/api/` must carry `X-Requested-With: eero-ui`, else `403 {"type": "csrf"}`.
- **Gate** — `experimental` means the route depends on `EERO_DASHBOARD_EXPERIMENTAL_WRITES` (closed: `403 {"type": "experimental_disabled"}`); `identity` means it additionally depends on `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES` (closed: `403 {"type": "account_identity_disabled"}`).
- **Limit** — slowapi limit per client IP. A named scope is shared by every route carrying it.
- **Path ids** — `{network_id}`, `{eero_id}`, `{profile_id}`, `{device_id}` are validated before any SDK call; a malformed value is `400 {"detail": "Invalid <name>."}`.
- **Mapped errors** (any route) — `402 premium_required`, `403` access denied, `404` not found, `409 feature_unavailable`, `422 {field, message}` validation, `429` (with `Retry-After: 60`), `502` cloud error, `503` unreachable/timeout. See [[Architecture#exception-layer]].
- Many routes accept an optional `?network_id=` query; when omitted the preferred network is used.

## 🩺 Health

| Method | Endpoint | Auth | Response | Notes |
|---|---|---|---|---|
| `GET` | `/api/health` | no | `{status, version, eero_client_version, experimental_writes}` | `experimental_writes` lets the UI hide gated controls |

## 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Auth | Limit | Request | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/auth/status` | no | — | — | `AuthStatusResponse` | `reason`: `null` (live), `"none"` (no token), `"expired"` (probe failed; token cleared) |
| `POST` | `/api/auth/login` | no | 5/minute | `LoginRequest {identifier}` | `LoginResponse` | `401` bad identifier, `503` cloud unreachable; never reported as "expired" |
| `POST` | `/api/auth/verify` | no | 5/minute | `VerifyRequest {code}` | `VerifyResponse {success, message, preferred_network_id}` | `401` wrong code |
| `POST` | `/api/auth/logout` | no | — | — | `{success, message}` | clears local state even if the cloud call fails |

## 🌐 Networks (`/api/networks`)

### Reads

| Method | Endpoint | Response | Notes |
|---|---|---|---|
| `GET` | `/api/networks` | `list[NetworkSummary]` | |
| `GET` | `/api/networks/{network_id}` | `NetworkDetail` | |
| `GET` | `/api/networks/{network_id}/speedtests` | `list[SpeedTestResult]` | most recent first; `?limit=` bounded, `400` if out of range |
| `GET` | `/api/networks/{network_id}/guest` | `GuestNetworkStatus` | password never returned |
| `GET` | `/api/networks/{network_id}/dns` | `DnsSettings` | per-family IPv4/IPv6 view, ISP upstream, provider catalogue |
| `GET` | `/api/networks/{network_id}/entitlements` | `NetworkEntitlements` | features, upsell, `is_premium`, `premium_status`, capabilities, `experimental_writes`; each source fail-soft |
| `GET` | `/api/networks/{network_id}/scan` | `NetworkScanResponse` | channel/neighbour scan |
| `GET` | `/api/networks/{network_id}/insights` | `InsightsResponse` | `?insight_type=adblock|blocked|inspected`, strict window; premium (`402`) |
| `GET` | `/api/networks/{network_id}/data-usage` | `DataUsageResponse` | premium |
| `GET` | `/api/networks/{network_id}/data-usage/breakdown` | `DataUsageResponse` | premium |
| `GET` | `/api/networks/{network_id}/data-usage/devices` | `DataUsageResponse` | premium |
| `GET` | `/api/networks/{network_id}/data-usage/devices/{device_mac}` | `DataUsageResponse` | `400` malformed MAC; premium |
| `GET` | `/api/networks/{network_id}/data-usage/eeros/summary` | `DataUsageResponse` | premium |
| `GET` | `/api/networks/{network_id}/data-usage/eeros/{eero_id}` | `DataUsageResponse` | premium |
| `GET` | `/api/networks/{network_id}/data-usage/profiles/{profile_id}` | `DataUsageResponse` | premium |
| `GET` | `/api/networks/{network_id}/events` | `AppEventsResponse` | `?page_size=`; `400` out of range |
| `GET` | `/api/networks/{network_id}/channel-utilization` | raw (stripped) | `?eero_id=&granularity=`; `400`/`422` on bad params; not cached |
| `GET` | `/api/networks/{network_id}/permissions` | `PermissionsResponse` | |
| `GET` | `/api/networks/{network_id}/members` | `MembersResponse` | a `403` from the cloud is reported as partial |
| `GET` | `/api/networks/{network_id}/invites` | `InvitesResponse` | |
| `GET` | `/api/networks/{network_id}/backup-internet` | `BackupInternetResponse` | status, cellular usage and events |
| `GET` | `/api/networks/{network_id}/backup-access-points` | `BackupAccessPointsResponse` | |
| `GET` | `/api/networks/{network_id}/security` | `SecuritySettingsResponse` | WPA3, band steering, UPnP, IPv6, per-band WPA3 |
| `GET` | `/api/networks/{network_id}/subnets` | `SubnetsResponse` | |
| `GET` | `/api/networks/{network_id}/multistaticip` | `MultiStaticIpResponse` | `404` from the cloud is reported as no config |
| `GET` | `/api/networks/{network_id}/advanced` | `AdvancedNetworkSettings` | DHCP, connection mode, power saving, DDNS |
| `GET` | `/api/networks/{network_id}/power-saving/schedules` | `PowerSavingSchedulesResponse` | |
| `GET` | `/api/networks/{network_id}/notifications` | `NotificationsResponse` | settings and unread flag |
| `GET` | `/api/networks/{network_id}/notifications/history` | `NotificationHistoryResponse` | `400` bad paging |
| `GET` | `/api/networks/{network_id}/forwards` | `ForwardsResponse` | |
| `GET` | `/api/networks/{network_id}/reservations` | `ReservationsResponse` | |
| `GET` | `/api/networks/{network_id}/content-filter` | `ContentFilterResponse` | premium |

### Verified writes (not gated)

| Method | Endpoint | Limit | Request | Response | Notes |
|---|---|---|---|---|---|
| `POST` | `/api/networks/{network_id}/set-preferred` | — | — | `{success, preferred_network_id}` | in-memory only |
| `POST` | `/api/networks/{network_id}/speedtest` | 2/minute `speedtest` | — | `202 SpeedTestStartedResponse {status: "started", started_at}` | `409 {"type": "speedtest_in_progress"}` within 90 s of a previous start on the same network; read the result from `/speedtests` |
| `PUT` | `/api/networks/{network_id}/guest-network` | — | query `?enabled=<bool>[&name=]` | `{success, ...}` | disconnects guest clients |
| `PUT` | `/api/networks/{network_id}/guest/password` | 5/minute `guest_password` | `GuestPasswordRequest {password}` | `GuestPasswordResponse` | read-back returned; password never echoed |
| `DELETE` | `/api/networks/{network_id}/guest/password` | 5/minute `guest_password` | — | `GuestPasswordResponse` | |

### Settings-class writes, pre-existing (not gated; reboot the mesh)

| Method | Endpoint | Request | Response | Notes |
|---|---|---|---|---|
| `PUT` | `/api/networks/{network_id}/dns` | `DnsUpdateRequest` | `DnsUpdateResponse {success, changed, ...}` | server-side no-op guard on parsed addresses; `changed: false` means nothing was written; `422 {field, message}` on a bad server; **proven to reboot every eero** |
| `PUT` | `/api/networks/{network_id}/name` | `NetworkRenameRequest {name}` | `{success, changed, name}` | `422` on control/format characters or > 32 bytes; no-op guard; assumed to reboot the mesh |

### Settings-class writes (gate: experimental; limit 2/minute `settings_writes`; reboot warning)

Each route depends on its own gate constant in `networks.py` (`_SQM_GATE`, `_DHCP_GATE`, …), all currently aliasing the experimental gate.

| Method | Endpoint | Request | Response | Notes |
|---|---|---|---|---|
| `PUT` | `/api/networks/{network_id}/sqm` | `SqmUpdateRequest` | `SqmUpdateResponse` | no-op guard |
| `PUT` | `/api/networks/{network_id}/dhcp` | `DhcpUpdateRequest {mode, custom?}` | `DhcpUpdateResponse` | `422` invalid range; `custom_v2` not exposed |
| `PUT` | `/api/networks/{network_id}/connection-mode` | `ConnectionModeRequest {mode: BRIDGE|NAT}` | `ConnectionModeResponse` | |
| `PUT` | `/api/networks/{network_id}/nat-port-randomization` | `NatPortRandomizationRequest {enabled}` | `NatPortRandomizationResponse` | best-effort no-op guard |
| `PUT` | `/api/networks/{network_id}/wpa3` | `Wpa3PerBandRequest` | `Wpa3PerBandResponse` | `422`; no 6 GHz field in v8.0.3 |
| `PUT` | `/api/networks/{network_id}/security` | `SecurityUpdateRequest` (exactly one of `wpa3`, `band_steering`, `upnp`, `ipv6`) | `SecurityUpdateResponse` | `422` if zero or more than one field |
| `PUT` | `/api/networks/{network_id}/mlo` | `MloUpdateRequest` | `MloUpdateResponse` | best-effort no-op guard (no getter) |
| `PUT` | `/api/networks/{network_id}/fast-transition` | `FastTransitionRequest {enabled}` | `FastTransitionResponse` | |
| `PUT` | `/api/networks/{network_id}/passpoint` | `PasspointRequest {enabled}` | `PasspointResponse` | best-effort no-op guard |
| `PUT` | `/api/networks/{network_id}/proxied-nodes` | `ProxiedNodesRequest {enabled}` | `ProxiedNodesResponse` | no no-op guard — always writes |
| `PUT` | `/api/networks/{network_id}/power-saving` | `PowerSavingRequest` | `PowerSavingResponse` | `422` |
| `PUT` | `/api/networks/{network_id}/subnets` | `SubnetConfigRequest` (strict) | `SubnetConfigResponse` | `422`; `password` never echoed |
| `DELETE` | `/api/networks/{network_id}/subnets/{subnet_type}` | — | `SubnetConfigResponse` | `400` unknown type |
| `PUT` | `/api/networks/{network_id}/multistaticip` | `MultiStaticIpRequest` | `MultiStaticIpUpdateResponse` | |
| `PUT` | `/api/networks/{network_id}/secondary-wan` | `SecondaryWanConfigRequest` (bulk) | `SecondaryWanConfigResponse` | `422`; no no-op guard for the bulk form |
| `POST` | `/api/networks/{network_id}/updates/apply` | — | `NetworkUpdateApplyResponse` | `409 {"type": "no_update_available"}` when nothing is pending; reboots every node |
| `PUT` | `/api/networks/{network_id}/password` | `NetworkPasswordRequest {password}` | `NetworkPasswordResponse` | limit 2/minute `network_password`; `422`; disconnects every client; never logged or echoed |
| `DELETE` | `/api/networks/{network_id}/password` | — | `NetworkPasswordResponse` | limit 2/minute `network_password` |

### Unverified, non-settings writes (gate: experimental; limit 10/minute `experimental_writes` unless noted)

| Method | Endpoint | Request | Response | Notes |
|---|---|---|---|---|
| `PUT` | `/api/networks/{network_id}/ddns` | `DdnsUpdateRequest {enabled}` | `DdnsUpdateResponse` | |
| `PUT` | `/api/networks/{network_id}/backup-internet` | `BackupInternetToggleRequest {enabled}` | `BackupInternetToggleResponse` | premium |
| `PUT` | `/api/networks/{network_id}/thread` | `ThreadUpdateRequest` | `ThreadUpdateResponse` | |
| `POST` | `/api/networks/{network_id}/thread/regenerate` | — | `{success, ...}` | limit 1/minute `thread_regenerate` |
| `PUT` | `/api/networks/{network_id}/notifications` | `NotificationSettingsUpdateRequest` | `NotificationsResponse` | `400`/`422` |
| `POST` | `/api/networks/{network_id}/notifications/mark-read` | — | `{success}` | |
| `POST` | `/api/networks/{network_id}/invites` | `InviteCreateRequest` | `201 InviteCreateResponse` | limit 2/minute `invite_create`; `422`; returns no invite id |
| `PUT` | `/api/networks/{network_id}/invites/{invite_id}` | `InviteUpdateRequest {name}` | `InviteSummary` | `422` |
| `DELETE` | `/api/networks/{network_id}/invites/{invite_id}` | — | `{success}` | |
| `POST` | `/api/networks/{network_id}/members/{member_id}/promote` | — | `{success}` | |
| `DELETE` | `/api/networks/{network_id}/admins/{user_id}` | — | `{success}` | |
| `POST` | `/api/networks/{network_id}/pending-admin/cancel` | — | `{success}` | |
| `POST` | `/api/networks/{network_id}/backup-access-points` | `BackupAccessPointCreateRequest` | `201 BackupAccessPoint` | |
| `PUT` | `/api/networks/{network_id}/backup-access-points/order` | `BackupAccessPointOrderRequest` | `{success}` | |
| `PUT` | `/api/networks/{network_id}/backup-access-points/{ap_id}` | `BackupAccessPointUpdateRequest` | `BackupAccessPoint` | |
| `DELETE` | `/api/networks/{network_id}/backup-access-points/{ap_id}` | — | `{success}` | |
| `POST` | `/api/networks/{network_id}/backup-access-points/discover` | — | `BackupSsidDiscoveryResponse` | starts discovery and returns the result |
| `POST` | `/api/networks/{network_id}/backup-access-points/check` | — | `{success, ...}` | connectivity check |
| `POST` | `/api/networks/{network_id}/forwards` | `ForwardCreateRequest` | `201 ForwardSummary` | |
| `PUT` | `/api/networks/{network_id}/forwards/{forward_id}` | `ForwardUpdateRequest` | `ForwardSummary` | |
| `DELETE` | `/api/networks/{network_id}/forwards/{forward_id}` | — | `{success}` | |
| `POST` | `/api/networks/{network_id}/reservations` | `ReservationCreateRequest` | `201 ReservationSummary` | `422` |
| `PUT` | `/api/networks/{network_id}/reservations/{reservation_id}` | `ReservationUpdateRequest` | `ReservationSummary` | `422` |
| `DELETE` | `/api/networks/{network_id}/reservations/{reservation_id}` | — | `{success}` | `?delete_forwards=` |
| `POST` / `DELETE` | `/api/networks/{network_id}/content-filter/allow` | `DomainRequest {domain}` | `ContentFilterResponse` | premium |
| `POST` / `DELETE` | `/api/networks/{network_id}/content-filter/block` | `DomainRequest {domain}` | `ContentFilterResponse` | premium |
| `POST` / `DELETE` | `/api/networks/{network_id}/content-filter/allow-for-profiles` | `DomainForProfilesRequest` | `{success}` | premium |
| `POST` / `DELETE` | `/api/networks/{network_id}/content-filter/block-for-profiles` | `DomainBlockForProfilesRequest` | `{success}` | premium |
| `POST` | `/api/networks/{network_id}/power-saving/schedules` | `PowerSavingScheduleCreateRequest` | `PowerSavingScheduleActionResponse` | `422` |
| `PUT` | `/api/networks/{network_id}/power-saving/schedules/{schedule_id}` | `PowerSavingScheduleUpdateRequest` | `PowerSavingScheduleActionResponse` | `400`/`422` |
| `DELETE` | `/api/networks/{network_id}/power-saving/schedules/{schedule_id}` | — | `PowerSavingScheduleActionResponse` | `400` |

## 📱 Devices (`/api/devices`)

| Method | Endpoint | Gate | Limit | Request | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/devices` | — | — | — | `list[DeviceSummary]` | |
| `GET` | `/api/devices/{device_id}` | — | — | — | `DeviceDetail` | |
| `POST` | `/api/devices/{device_id}/block` | experimental | 10/minute `experimental_writes` | — | `DeviceAction` | MAC resolved server-side; `422` if the device has no MAC; unverified |
| `POST` | `/api/devices/{device_id}/unblock` | — | — | — | `DeviceAction` | MAC resolved server-side; `422` without MAC; verified |
| `PUT` | `/api/devices/{device_id}/nickname` | — | — | `NicknameRequest {nickname}` | `DeviceAction` | stripped; `422` on control/format characters; verified |
| `PUT` | `/api/devices/{device_id}/type` | — | 10/minute `device_type` | `DeviceTypeRequest {device_type}` | `DeviceAction` | `422` unknown type; verified |
| `PUT` | `/api/devices/{device_id}/secondary-wan-access` | experimental (`_SECONDARY_WAN_ACCESS_GATE`) | 2/minute `settings_writes` | `SecondaryWanAccessRequest {denied}` | `SecondaryWanAccessResponse` | settings-class; best-effort no-op guard |
| `GET` | `/api/devices/{device_id}/insights` | — | — | — | `InsightsResponse` | premium |

## 📶 Eeros (`/api/eeros`)

| Method | Endpoint | Gate | Limit | Request | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/eeros` | — | — | — | `list[EeroSummary]` | |
| `GET` | `/api/eeros/{eero_id}` | — | — | — | `EeroDetail` | |
| `POST` | `/api/eeros/{eero_id}/reboot` | — | — | — | `EeroAction` | verified; reboots that node only |
| `GET` | `/api/eeros/{eero_id}/led` | — | — | — | `LedStatus {led_on, led_brightness}` | |
| `POST` | `/api/eeros/{eero_id}/led` | — | — | `{enabled}` | `EeroAction` | verified (was a silent no-op before v8) |
| `PUT` | `/api/eeros/{eero_id}/led/brightness` | — | 10/minute `led_brightness` | `{brightness}` | `EeroLedBrightnessAction` | read-back returned; verified |
| `GET` | `/api/eeros/{eero_id}/connections` | — | — | — | `EeroConnectionsResponse` | |
| `PUT` | `/api/eeros/{eero_id}/location` | experimental | 10/minute `experimental_writes` | `LocationUpdateRequest {location}` | `LocationUpdateResponse` | `422` |
| `POST` | `/api/eeros/{eero_id}/node-action` | experimental | 2/minute `node_actions` | `NodeActionRequest {action}` | `NodeActionResponse {reboots_node, ...}` | `POWER_CYCLE_ALL_PORTS_AND_REBOOT` reboots the node; `422` |
| `POST` | `/api/eeros/{eero_id}/ports/{port_number}/action` | experimental | 2/minute `node_actions` | `PortActionRequest {action}` | `PortActionResponse` | `422 {"type": "port_protected"}` when the target is the gateway's WAN/uplink port |

## 👤 Profiles (`/api/profiles`)

| Method | Endpoint | Gate | Limit | Request | Response | Notes |
|---|---|---|---|---|---|---|
| `GET` | `/api/profiles` | — | — | — | `list[ProfileSummary]` | |
| `GET` | `/api/profiles/{profile_id}` | — | — | — | `ProfileSummary` | |
| `POST` | `/api/profiles` | experimental | 10/minute `experimental_writes` | `ProfileCreateRequest {name}` | `201 ProfileSummary` | `400` |
| `PATCH` | `/api/profiles/{profile_id}` | experimental | 10/minute `experimental_writes` | `ProfileRenameRequest {name}` | `ProfileSummary` | `400` |
| `DELETE` | `/api/profiles/{profile_id}` | experimental | 10/minute `experimental_writes` | — | `ProfileAction` | devices become unassigned |
| `POST` | `/api/profiles/{profile_id}/pause` | experimental | 10/minute `experimental_writes` | — | `ProfileAction` | SDK logs a WARNING |
| `POST` | `/api/profiles/{profile_id}/unpause` | experimental | 10/minute `experimental_writes` | — | `ProfileAction` | |
| `POST` | `/api/profiles/{profile_id}/assign-devices` | experimental | 10/minute `experimental_writes` | `AssignDevicesRequest {device_ids}` | `AssignDevicesResponse` | merges with the existing list |
| `GET` | `/api/profiles/{profile_id}/insights` | — | — | — | `InsightsResponse` | premium |
| `GET` | `/api/profiles/{profile_id}/schedules` | — | — | — | `list[ScheduleSummary]` | |
| `POST` | `/api/profiles/{profile_id}/schedules` | experimental | 10/minute `experimental_writes` | `ScheduleCreateRequest` | `201 ScheduleSummary` | |
| `PUT` | `/api/profiles/{profile_id}/schedules/{schedule_id}` | experimental | 10/minute `experimental_writes` | `ScheduleUpdateRequest` | `ScheduleSummary` | |
| `DELETE` | `/api/profiles/{profile_id}/schedules/{schedule_id}` | experimental | 10/minute `experimental_writes` | — | `{success}` | |
| `DELETE` | `/api/profiles/{profile_id}/schedules` | experimental | 10/minute `experimental_writes` | — | `{success}` | clears every schedule |
| `POST` | `/api/profiles/{profile_id}/bedtime` | experimental | 10/minute `experimental_writes` | `BedtimeCreateRequest` | `201 ScheduleSummary` | |
| `GET` | `/api/profiles/{profile_id}/blocked-applications` | — | — | — | `BlockedApplicationsResponse` | premium |
| `PUT` | `/api/profiles/{profile_id}/blocked-applications` | experimental | 10/minute `experimental_writes` | `SetBlockedApplicationsRequest` | `BlockedApplicationsResponse` | premium |

## 👥 Account (`/api/account`)

All account writes share the `account_writes` scope at 10/minute.

| Method | Endpoint | Gate | Request | Response | Notes |
|---|---|---|---|---|---|
| `GET` | `/api/account/sms-countries` | — | — | `SmsCountriesResponse` | |
| `PUT` | `/api/account/name` | experimental | `AccountNameRequest {name}` | `AccountActionResponse` | |
| `PUT` | `/api/account/consents` | experimental | `AccountConsentsRequest` | `AccountActionResponse` | marketing e-mail consent |
| `PUT` | `/api/account/email` | experimental + identity | `AccountEmailRequest {email}` | `AccountActionResponse` | inactive until verified |
| `POST` | `/api/account/email/verify` | experimental + identity | `VerificationCodeRequest {code}` | `AccountActionResponse` | |
| `PUT` | `/api/account/phone` | experimental + identity | `AccountPhoneRequest {phone}` | `AccountActionResponse` | inactive until verified |
| `POST` | `/api/account/phone/verify` | experimental + identity | `VerificationCodeRequest {code}` | `AccountActionResponse` | |

## 📈 Metrics (`/api/metrics`)

All routes require a session (router-level `require_auth`). `503 "Metrics service unavailable"` when VictoriaMetrics cannot be reached. See [[Metrics]].

| Method | Endpoint | Query | Response |
|---|---|---|---|
| `GET` | `/api/metrics/health` | — | `{victoria_metrics, status, last_successful_write, collector_errors_total}` |
| `GET` | `/api/metrics/speedtest/history` | `start`, `end`, `step=5m`, `network_id?` | `{download, upload}` (VictoriaMetrics `query_range` results) |
| `GET` | `/api/metrics/devices/{device_id}/signal` | `start`, `end`, `step=1m` | `{signal_strength, connection_score}`; `400` on a malformed id |
| `GET` | `/api/metrics/network/client_count` | `start`, `end`, `step=5m` | `{total, wireless, wired, client_count}` |

## Removed in 6.0

| Route | Why |
|---|---|
| `GET /metrics` (Prometheus proxy) | the exporter is no longer embedded; eero-ui is not a scrape target. Returns `404`, not the SPA |
| `GET /api/metrics/query` | raw PromQL passthrough with no frontend caller and an unbounded query surface |
| `GET /api/metrics/query_range` | same |
| `GET /api/metrics/eeros/{serial}/quality` | no frontend caller |
| `GET /api/metrics/devices/{mac}/bandwidth` | no frontend caller; the exporter never produced per-device bandwidth |

Also gone: `exporter_version` in `GET /api/health`, and `POST /api/networks/{id}/speedtest` no longer returns the result inline (it returns `202`; read `/speedtests`).
