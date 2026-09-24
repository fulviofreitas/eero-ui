# 🔒 Security

## What This Dashboard Does

| ✅ | Security Feature |
|----|-----------------|
| ✅ | Stores the eero session token server-side only, in one file owned by the `eero-api` SDK |
| ✅ | Writes that file with mode `0600`, atomically (temp file + rename, symlink refused) |
| ✅ | Sends the token to the eero cloud as the `X-User-Token` header; the legacy `s=` cookie is off by default |
| ✅ | Uses an httpOnly cookie for the dashboard session |
| ✅ | Requires `X-Requested-With: eero-ui` on every `/api` write (CSRF guard) |
| ✅ | Requires an authenticated session on every `/api/metrics/*` route |
| ✅ | Binds VictoriaMetrics to `127.0.0.1` inside the container; it is never published |
| ✅ | Exposes no `/metrics` endpoint at all |
| ✅ | Validates every path identifier before it reaches the SDK or a PromQL selector |
| ✅ | Strips credential-shaped keys from raw passthrough responses |
| ✅ | Hides unverified writes and account-identity writes behind two independent gates |
| ✅ | Never surfaces the eero cloud's error message or envelope to the browser; logs the envelope only at DEBUG |
| ✅ | Rate-limits login/verify, speed tests, settings writes and every experimental write |

## What You Should Do

| 🔐 | Recommendation |
|----|----------------|
| 🔐 | Run behind a reverse proxy (nginx, Caddy) with HTTPS |
| 🔐 | Set a strong `EERO_DASHBOARD_SESSION_SECRET` |
| 🔐 | Restrict access to trusted networks/VPN |
| 🔐 | Leave `EERO_DASHBOARD_EXPERIMENTAL_WRITES` and `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES` off unless you need them |
| 🔐 | If you run the optional exporter, keep its unauthenticated `/metrics` loopback-bound |

## One session is the whole account

Logging into eero-ui is logging into the eero **account**, not one network. Whoever can reach the dashboard holds every capability the account has: every network, every write, and — if enabled — the account's recovery identity. That is why:

- account e-mail and phone changes (`PUT /api/account/email`, `PUT /api/account/phone` and their `/verify` routes) need a second flag, `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES`, on top of `EERO_DASHBOARD_EXPERIMENTAL_WRITES` — turning on experimental writes for a settings screen must not silently expose account-takeover-adjacent writes;
- the dashboard should never be reachable from an untrusted network.

## Authentication Flow

1. User enters email/phone.
2. eero sends an OTP code via SMS/email.
3. User enters the OTP in the dashboard.
4. The SDK stores the eero session token in the credential file (`EERO_DASHBOARD_COOKIE_FILE`).
5. The dashboard uses an httpOnly cookie for subsequent requests.

There is no fixed client-side expiry. When the eero cloud rejects the token, the backend clears it and answers `401` with `reason: "expired"`; `GET /api/auth/status` then reports `authenticated: false, reason: "expired"` and the login page says so.

## Credential File

- One file, credential **schema 2**, written by `eero-api` v8. Legacy records are migrated in place on first load (logged at INFO).
- Written `0600` via a `mkstemp` temp file and rename; a symlink at the target path is refused.
- The SDK is constructed with `use_keyring=False` (pinned by a test): single-file storage, no keyring fallback chain where a write can vanish silently.
- The exporter dual-write (`exporter-session.json`, mode `0644`) that 5.x produced is gone; a leftover copy on an upgraded volume is deleted once at startup.

## Session Management

The dashboard session cookie is signed with `EERO_DASHBOARD_SESSION_SECRET`, which should be:

- At least 32 bytes (64 hex characters)
- Generated securely: `openssl rand -hex 32`
- Kept confidential (never commit to Git)
- Persistent across container restarts (use `.env` or a secrets manager)

## CSRF

The dashboard authenticates with an httpOnly cookie, which a browser attaches automatically, so cross-site pages could otherwise trigger writes. Every `POST`, `PUT`, `PATCH` and `DELETE` under `/api/` must carry `X-Requested-With: eero-ui`; a request without it gets `403 {"type": "csrf"}` before any route runs. A cross-site `<form>` or `no-cors` fetch cannot set an arbitrary header, so the check blocks simple CSRF with no token state. `GET`/`HEAD`/`OPTIONS` are exempt and must stay side-effect-free.

## Write Gates

| Gate | Env var | Covers |
|---|---|---|
| Experimental | `EERO_DASHBOARD_EXPERIMENTAL_WRITES` | every write not verified end-to-end: block device, profile CRUD/pause/assign/schedules, notifications, DDNS, backup access points, node/port actions, Thread, forwards, reservations, content filter, account name/consents, eero location, and every settings-class write (SQM, DHCP, connection mode, NAT, WPA3, security, MLO, fast transition, Passpoint, proxied nodes, power saving, subnets, WAN, firmware apply, network password) |
| Account identity | `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES` (in addition to the above) | account e-mail and phone change and verify |

Closed gates answer `403` with `type: "experimental_disabled"` or `type: "account_identity_disabled"`. Settings-class routes in `networks.py` depend on their own gate constant each, so a single family can be opened after live verification without opening the rest.

## Metrics Surface

- `/metrics` does not exist. The SPA catch-all explicitly returns `404` for it rather than `index.html`.
- `/api/metrics/*` is behind `require_auth` at the router level. The raw PromQL passthroughs were deleted.
- VictoriaMetrics listens on `127.0.0.1:8428` only. The collector's write path is loopback inside the container.
- Identifiers that reach a PromQL label selector (`network_id`, `device_id`) are validated with a full-match regex plus the SDK's own validator; a value containing quotes, braces, `..`, `/` or a newline is rejected with `400`.

## Passthrough Reads

Some WP6 read routes return raw SDK payloads whose shape is not fully documented (insights, data usage, events, backup internet, and so on). Each passes through `strip_sensitive_keys`, which recursively removes any key matching a password/PSK/secret/token/credential/code/PIN pattern (with a short allowlist of known-safe names). Guest and network password writes never echo the password back; `POST /api/networks/{id}/invites` returns no invite identifier.

## Reviewer Notes

- Never pass SDK exception messages into `detail`; the handlers in `main.py` use static strings.
- Rate-limit scopes are shared across paths on purpose — a per-path slowapi limit is bypassable by varying the path parameter.
- `EERO_DASHBOARD_SDK_GET_RETRIES` is clamped to `0`–`3` so an environment value cannot amplify load on the eero cloud; writes are never retried, on either side of the proxy.
