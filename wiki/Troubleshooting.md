# 🔧 Troubleshooting

## Common Issues

### "Your eero session expired"

The eero cloud rejected the stored token. The backend clears it, answers the failing request with `401 {"reason": "expired"}`, and `GET /api/auth/status` reports `authenticated: false, reason: "expired"`. The login page shows the expired-session message instead of a bare form. Log in again; nothing else needs resetting.

`reason: "none"` on `/api/auth/status` means there was no token at all (fresh volume, or an explicit logout).

If the session expires repeatedly right after logging in, check that the container can reach `api-user.e2ro.com` and that the clock is roughly correct.

### `WARNING` lines from `eero.api` on every profile or block action

Expected. Since eero-api 8.0.2 the SDK logs one WARNING per call for every write it has not itself verified against a live network (`block_device`, `create_profile`, `rename_profile`, `pause_profile`, `set_profile_devices`, `delete_profile`, DNS writes, the settings-class writes). Do not suppress these lines — they are the audit trail that tells you which unverified writes were issued and when. The verified writes (LED, rename device, unblock, guest network, speed test, reboot) do not log them.

### `403` with `"type": "experimental_disabled"`

The route is an unverified write and `EERO_DASHBOARD_EXPERIMENTAL_WRITES` is not `true`. The UI hides these controls when `GET /api/health` reports `experimental_writes: false`; seeing the error means something called the route directly. Enable the flag only if you accept that the write has not been proven to apply end-to-end — see [[Roadmap]] for which ones those are.

### `403` with `"type": "account_identity_disabled"`

Account e-mail or phone changes need `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES=true` **in addition to** the experimental flag. See [[Security#one-session-is-the-whole-account]].

### `403` with `"type": "csrf"`

A `POST`/`PUT`/`PATCH`/`DELETE` under `/api/` arrived without `X-Requested-With: eero-ui`. The dashboard sends it on every write; a curl, script or other client must add the header explicitly:

```bash
curl -X POST -b "$COOKIE" -H 'X-Requested-With: eero-ui' http://localhost:8000/api/eeros/<id>/reboot
```

### `409` with `"type": "speedtest_in_progress"`

A speed test was started for this network less than 90 seconds ago. `POST /api/networks/{id}/speedtest` returns `202` immediately; the result appears in `GET /api/networks/{id}/speedtests` once the eero cloud finishes (30–90 s). Wait and re-read instead of re-posting. The route is also limited to 2 starts per minute.

### `422` with `"type": "port_protected"`

You asked to disable, power-cycle or cut PoE on the **gateway's WAN/uplink port**. The backend refuses because that would disconnect the whole network. Pick a different port or a different eero.

### `422` on block or unblock: device has no MAC

Since 6.0 block and unblock send the device's MAC to the eero blacklist, resolved server-side. A device record without a MAC cannot be blocked; this is rare and usually means the device is a stale entry.

### `402` with `"type": "premium_required"`

The feature (insights, data usage, content filter, blocked applications, backup internet, DNS policies) needs an eero Plus/Secure subscription on that network. `GET /api/networks/{id}/entitlements` tells the UI what to show.

### Charts are empty after the upgrade to 6.0

Work through these in order:

1. **Ask the collector first:**
   ```bash
   curl -s -b "$COOKIE" http://localhost:8000/api/metrics/health | jq .
   ```
   - `victoria_metrics: "unavailable"` — VictoriaMetrics is down inside the container; check `docker compose logs` for `[victoria]` lines.
   - `last_successful_write: null`, or older than about two collection intervals — the collector is not completing writes; look for `Metrics collector` warnings in the `[api]` log lines.
   - `collector_errors_total.auth` climbing — the session is dead; the collector shares the API's client, so log in again.
2. If the collector is healthy, the problem is on the read side: confirm the chart is asking for the right `network_id`, and that `EERO_DASHBOARD_VICTORIA_METRICS_URL` points at the same store on both paths (it is one setting).
3. If you upgraded a volume with pre-6.0 data, run `scripts/check-history-continuity.sh` against the cutover timestamp ([[Metrics#history-continuity]]). A hard FAIL means series identities changed across the boundary and will look exactly like empty charts.
4. If you also run the optional exporter, make sure nothing is scraping it into a *different* VictoriaMetrics than the one eero-ui reads. eero-ui never reads from the exporter.

Remember that `POST /api/v1/import` on VictoriaMetrics returns `204` even when it drops lines, so a recent `last_successful_write` proves the request was accepted, not that samples landed. `docker exec eero-ui curl -s 'http://127.0.0.1:8428/api/v1/query?query=eero_up'` is the definitive check.

### `/metrics` returns 404

By design. 6.0 removed the endpoint and eero-ui is not a scrape target. Run the optional exporter if you need one ([[Metrics#running-the-exporter-optional-decoupled]]).

### Speed test takes too long

Speed tests typically take 30–90 seconds. The UI polls the history endpoint against the server's start time and stops when a newer result appears.

### A settings save says the network will restart

That is accurate, not a bug. DNS changes are proven to reboot every eero a few minutes after the API answers `200`; network rename and the other settings-class writes are assumed to do the same and carry the same warning. Your own connection will drop mid-change. The UI stays in a static "applying" state and does not poll, because the API is unreachable while the mesh reboots. Refresh manually once Wi-Fi is back. `eero_network_last_reboot_timestamp_seconds` in the metrics store records when it happened.

### Device actions fail

Check the backend logs for the mapped error. Since 6.0 eero cloud errors map to specific codes (`401` expired, `402` premium, `403` denied, `409` unavailable, `422` validation, `429` rate limit, `502` cloud error, `503` unreachable) instead of a blanket 500, so the status alone usually says what happened.

```bash
EERO_DASHBOARD_DEBUG=true uvicorn app.main:app --reload
```

### Connection refused

Make sure both servers are running:

- Backend: port 8000
- Frontend (dev mode): port 5173

### Docker container won't start

1. Check if the port is already in use:
   ```bash
   lsof -i :8000
   ```
2. View container logs:
   ```bash
   docker compose logs -f
   ```
3. Ensure the session secret is set:
   ```bash
   echo $EERO_DASHBOARD_SESSION_SECRET
   ```
4. If either `victoria-metrics` or `uvicorn` exits, the supervisor stops the other and exits with its status, so a crash loop points at whichever `[victoria]`/`[api]` line is last in the log.

### Session lost after restart

Make sure you're using a persistent volume:

```bash
docker run -v eero-data:/data ...
```

Or with docker-compose, the volume is configured automatically.

## Backup and Rollback

Before the first 6.0 start, back up the session and the metrics data:

```bash
docker run --rm -v eero-data:/data -v "$PWD":/backup alpine \
  sh -c 'tar czf /backup/eero-session-$(date +%F).tgz -C /data session'
docker run --rm -v eero-data:/data -v "$PWD":/backup alpine \
  sh -c 'tar czf /backup/eero-victoria-metrics-$(date +%F).tgz -C /data victoria-metrics'
```

Rollback is redeploying the previous image tag against the same, unmodified volumes. The schema-2 credential record 6.0 writes is still readable by the 7.x SDK, so a rolled-back container normally does not force a re-login; if it does, restore the session tarball. VictoriaMetrics data needs no rollback action because both versions write the same series.

The complete procedure — backups, deploy, `scripts/smoke-test-image.sh`, `scripts/check-history-continuity.sh`, rollback, and the "charts empty" triage — is `claude/docs/runbook-6.0-upgrade.md` in the context repo.
