# ⚙️ Configuration

## Environment Variables

All settings are read once at startup from the environment (`backend/app/config.py`). The prefix is `EERO_DASHBOARD_`.

| Variable | Description | Default |
|----------|-------------|---------|
| `EERO_DASHBOARD_HOST` | Server bind address | `0.0.0.0` |
| `EERO_DASHBOARD_PORT` | Server port | `8000` |
| `EERO_DASHBOARD_DEBUG` | Enable debug logging, CORS for the dev server, and `/api/docs` | `false` |
| `EERO_DASHBOARD_SESSION_SECRET` | **Required.** Session encryption key | *(none — must be set)* |
| `EERO_DASHBOARD_COOKIE_FILE` | Path of the eero credential file, owned by the `eero-api` SDK | `/data/session/session.json` (Docker) / `~/.eero-dashboard/session.json` (local) |
| `EERO_DASHBOARD_VICTORIA_METRICS_URL` | VictoriaMetrics base URL. Used for **both** the collector's writes and the chart reads | `http://127.0.0.1:8428` |
| `EERO_DASHBOARD_COLLECTION_INTERVAL` | Seconds between metrics collection cycles. Clamped to a minimum of `10` | `60` |
| `EERO_DASHBOARD_METRICS_RETENTION` | How long the embedded VictoriaMetrics keeps data (`30d`, `6m`, `1y`). Shell-only: read by `container-start.sh`, not by Python | `1y` |
| `EERO_DASHBOARD_SDK_GET_RETRIES` | How many times the SDK retries a failed **GET** against the eero cloud. Clamped to `0`–`3`. Writes are never retried | `1` |
| `EERO_DASHBOARD_SDK_LEGACY_COOKIE` | Also send the session as the legacy `s=` cookie alongside the `X-User-Token` header. Off by default since 6.0 | `false` |
| `EERO_DASHBOARD_EXPERIMENTAL_WRITES` | Enable the write routes that are not verified end-to-end against a live eero network (see [[Roadmap]]). Off: those routes return `403` with `type: "experimental_disabled"` | `false` |
| `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES` | Second, independent gate for `PUT /api/account/email`, `PUT /api/account/phone` and their `/verify` routes. Both this **and** `EERO_DASHBOARD_EXPERIMENTAL_WRITES` must be `true` | `false` |

Removed in 6.0 (setting either has no effect): `EERO_EXPORTER_SESSION_PATH`, `EERO_DASHBOARD_METRICS_ENDPOINT_ENABLED`.

## Session Secret

For production, always set a strong session secret:

```bash
export EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)
```

The `start.sh` script auto-generates and saves this to `.env` on first run. A secret shorter than 32 characters logs a warning at startup.

## Debug Mode

Enable debug mode for detailed logging:

```bash
EERO_DASHBOARD_DEBUG=true uvicorn app.main:app --reload
```

This also enables the interactive API docs at `/api/docs` and CORS for `http://localhost:5173`.

## Metrics

Metrics are collected by eero-ui's **own collector** (a task inside the FastAPI process) and written into the embedded VictoriaMetrics instance. There is no exporter and nothing is scraped. See [[Metrics]] for the metric contract.

- **Collection interval** — `EERO_DASHBOARD_COLLECTION_INTERVAL` sets how often the collector reads the eero API and writes one batch of samples. Minimum `10` seconds; the default `60` is a sensible floor for the eero cloud's rate limits.
- **Retention** — `EERO_DASHBOARD_METRICS_RETENTION` sets how long VictoriaMetrics keeps data. Accepted suffixes: `d` (days), `w` (weeks), `m` (months), `y` (years).
- **Storage size** — old data is dropped only when it exceeds the retention period. Disk usage grows with the number of devices and the collection interval.
- **External store** — because `EERO_DASHBOARD_VICTORIA_METRICS_URL` serves both the write and the read path, pointing it at an external VictoriaMetrics makes the embedded one idle. It still starts inside the container; that is harmless.

## Write gates

Every write that eero-ui has **not** verified end-to-end against a live network sits behind `EERO_DASHBOARD_EXPERIMENTAL_WRITES`. With the flag off the routes exist but answer `403 {"type": "experimental_disabled"}`, and the UI hides the controls (the flag is reported by `GET /api/health` as `experimental_writes`). The verified writes — LED on/off and brightness, device rename and type, unblock, guest network enable/disable and password, speed test, reboot one eero — are always available.

Account e-mail and phone changes additionally need `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES=true`, because an eero-ui session is the whole eero account: whoever can reach the dashboard could otherwise re-home the account's recovery identity. See [[Security]].

## Upgrading to 6.0

6.0 is a breaking major. Read [[Troubleshooting#backup-and-rollback]] before starting; the full operational runbook (backup, deploy, smoke test, history-continuity check, rollback) is `claude/docs/runbook-6.0-upgrade.md` in the context repo.

What changes for an existing deployment:

- The Prometheus exporter is no longer embedded; eero-ui collects its metrics itself and writes them to VictoriaMetrics, and `EERO_EXPORTER_SESSION_PATH` and `EERO_DASHBOARD_METRICS_ENDPOINT_ENABLED` are removed.
- The `/metrics` endpoint is removed with no replacement; eero-ui is no longer a Prometheus scrape target, and nothing inside the container is scraped.
- Metrics beyond the eight the dashboard uses are no longer collected; run `ghcr.io/fulviofreitas/eero-prometheus-exporter:4.0.0` alongside and point your own Prometheus at it.
- `/api/metrics/*` now requires an authenticated session; the raw PromQL passthrough endpoints and two unused metrics routes are removed.
- Requires `eero-api >= 8.0.3`; session transport, auth encodings and the credential record changed upstream. The credential file is migrated to schema 2 in place on first start — no re-login is needed.
- `POST /api/networks/{id}/speedtest` returns `202` and the result is read from `GET /api/networks/{id}/speedtests`; `SpeedTestResult` has a single normalised shape.
- Device block and unblock resolve the device MAC server-side; a device without a known MAC is rejected with `422`.
- eero-api errors map to `401/402/403/409/422/429/502/503` instead of a blanket `500`; `GET /api/auth/status` gains `reason`.
- Settings-class writes require confirmation and may restart every eero; unverified writes are hidden unless `EERO_DASHBOARD_EXPERIMENTAL_WRITES=true`.

Steps:

1. Back up the `eero-data` volume (session and VictoriaMetrics data) as described in the runbook.
2. Remove `EERO_EXPORTER_SESSION_PATH` and `EERO_DASHBOARD_METRICS_ENDPOINT_ENABLED` from your compose file or manifest.
3. Start the 6.0 image against the same volume. Existing metric history stays continuous because the metric names and label sets are unchanged ([[Metrics#history-continuity]]).
4. Optionally run `scripts/check-history-continuity.sh` against the cutover timestamp.
