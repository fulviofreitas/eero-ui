# 📈 Metrics

Since 6.0, eero-ui collects its own metrics. A collector task inside the FastAPI process reads the eero API through the same SDK client the dashboard uses, and writes samples straight into the embedded VictoriaMetrics store. The charts read them back through the same store.

There is **no exporter** in the image, **no `/metrics` endpoint**, and **nothing is scraped**. eero-ui is not a Prometheus scrape target.

## How collection works

```
MetricsCollector (backend/app/services/collector.py)
   every EERO_DASHBOARD_COLLECTION_INTERVAL seconds (default 60, minimum 10):
     get_networks() → for each network: get_devices(), get_eeros(),
     get_speed_tests(limit=1), get_dns_settings()
     normalise with transformers.py
   ──► VictoriaMetricsClient.write()  →  POST /api/v1/import  (newline-delimited JSON)
   ◄── routes/metrics.py reads with query_range() for the charts
```

- One batch per cycle, one timestamp per batch. Every network on the account is collected, so switching networks in the UI shows a populated chart immediately.
- The collector shares the `EeroClient` singleton and its 60 s cache with the API routes; it never logs in on its own. While no session exists it writes `eero_up 0` and nothing else.
- A failure in any sub-fetch is logged at WARNING, counted, and does not stop the rest of the cycle being written.
- `GET /api/metrics/health` (authenticated) reports `victoria_metrics`, `last_successful_write` and `collector_errors_total` by reason (`auth`, `api`, `network`, `write`, `unknown`).

### VictoriaMetrics accepts and discards silently

`POST /api/v1/import` returns **204 for a malformed body, a partly malformed body and a fully valid one alike**; dropped lines are visible only in VictoriaMetrics' own log (verified against the pinned v1.96.0 binary). `last_successful_write` therefore proves only that the request was accepted. The image smoke test (`scripts/smoke-test-image.sh`) reads every contract metric back after one cycle, and that read-back is the real guard.

## The metric contract

These eight metrics, with exactly these label keys, are what the dashboard queries. They are a **stability contract**: names and label sets are byte-identical to what `eero-prometheus-exporter` wrote, so history collected before 6.0 remains one continuous series. A CI test asserts that every name referenced by `routes/metrics.py` is produced by the collector and vice versa.

| Metric | Type | Labels (exact, order-insensitive) | Source |
|---|---|---|---|
| `eero_up` | Gauge | — | `1` when the whole cycle succeeded, `0` otherwise |
| `eero_network_clients_count` | Gauge | `network_id`, `name` | count of devices with `connected: true` |
| `eero_speed_download_mbps` | Gauge | `network_id` | most recent speed test |
| `eero_speed_upload_mbps` | Gauge | `network_id` | most recent speed test |
| `eero_device_connected` | Gauge | `network_id`, `device_id`, `name`, `mac`, `manufacturer`, `device_type`, `connection_type`, `source_eero` | every device the API lists; `0` for a known-but-offline device |
| `eero_device_signal_strength_dbm` | Gauge | `network_id`, `device_id`, `name`, `manufacturer`, `band`, `source_eero` | devices reporting a signal strength |
| `eero_device_connection_score_bars` | Gauge | `network_id`, `device_id`, `name`, `manufacturer`, `connection_type`, `source_eero` | devices reporting signal bars |
| `eero_eero_mesh_quality_bars` | Gauge | `network_id`, `eero_id`, `location`, `model` | every eero reporting mesh quality |

`device_id` and `eero_id` are the trailing path segment of the resource URL, the same derivation the exporter used. Label values are coerced to strings; a missing value becomes `""`.

Notes on behaviour:

- **Offline devices** are still listed by the API and are written as `eero_device_connected 0`, so `count(eero_device_connected == 1)` stays correct.
- **Removed devices** simply stop receiving samples. Instant queries keep showing them for VictoriaMetrics' lookback window (5 minutes by default).
- **Renaming a device** changes its `name` label and starts a new series. That is why the charts filter on `device_id`, never on `name`.
- Cardinality is bounded by the device count of a home network. Do not add per-request or timestamp-like labels.

## Added in 6.0

Six series the exporter did not provide, written on the same cycle:

| Metric | Labels | Why |
|---|---|---|
| `eero_network_last_reboot_timestamp_seconds` | `network_id` | direct observable for "a settings write reboots the mesh" |
| `eero_eero_last_reboot_timestamp_seconds` | `network_id`, `eero_id` | per-node confirmation that a reboot hit only its target |
| `eero_network_dns_mode` | `network_id`, `mode` | read-back cross-check for the DNS screen (IPv4 mode) |
| `eero_eero_client_count` | `network_id`, `eero_id`, `location` | already computed for the per-eero pie |
| `eero_collector_cycle_seconds` | — | how long the last cycle took |
| `eero_collector_errors_total` | `reason` | cumulative failures since process start; one sample per reason every cycle, so a stalled collector shows as a gap in this series too |

## Reading metrics

Every `/api/metrics/*` route requires an authenticated dashboard session; there is no unauthenticated way to read the store from outside the container.

| Route | Returns |
|---|---|
| `GET /api/metrics/health` | store health, `last_successful_write`, `collector_errors_total` |
| `GET /api/metrics/speedtest/history?start&end&step[&network_id]` | download/upload series |
| `GET /api/metrics/devices/{device_id}/signal?start&end&step` | signal strength and connection score |
| `GET /api/metrics/network/client_count?start&end&step` | total, wireless and wired counts |

The raw PromQL passthroughs (`/api/metrics/query`, `/query_range`) were removed in 6.0. Query VictoriaMetrics directly from inside the container if you need ad-hoc PromQL:

```bash
docker exec eero-ui curl -s 'http://127.0.0.1:8428/api/v1/query?query=eero_up'
```

## Pointing at an external VictoriaMetrics

`EERO_DASHBOARD_VICTORIA_METRICS_URL` is used for both the write and the read path, so setting it to another VictoriaMetrics instance moves collection and charts there together. The embedded instance still starts inside the container and simply sits idle; making it optional is not in scope. Whatever you point at must accept `POST /api/v1/import` and expose `/api/v1/query_range` and `/health`.

## Running the exporter (optional, decoupled)

If you want the exporter's full 90+ metric set for your own Prometheus, run it yourself:

```yaml
eero-exporter:
  image: ghcr.io/fulviofreitas/eero-prometheus-exporter:4.0.0
  ports:
    - "127.0.0.1:10052:10052"
  volumes:
    - eero-exporter-session:/data/session
  environment:
    EERO_EXPORTER_SESSION_FILE: /data/session/exporter-session.json
    EERO_EXPORTER_HOST: "0.0.0.0"
    EERO_EXPORTER_PORT: "10052"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:10052/ready"]
```

The same block is present, commented out, in `docker-compose.yml`. Facts that matter:

- It is its **own login**, with its own credential file (`EERO_EXPORTER_SESSION_FILE`). It does not share eero-ui's `/data/session`.
- Default port is **10052**. Health probes must use `GET /ready`; `HEAD` returns 501.
- Its `/metrics` endpoint has **no authentication** and exposes device names, MACs and topology. Keep it loopback-bound or behind your own firewall.
- There is **no coupling** back to eero-ui: eero-ui neither ships, launches, configures, pins nor reads from it, and every dashboard chart works without it. Because the metric names match, dashboards built on the exporter's names keep working against either source.

## History continuity

Series written by the exporter before 6.0 and by the native collector after it are continuous, because the names and label sets are preserved. To prove it on your own volume after upgrading, record the cutover time and run:

```bash
./scripts/check-history-continuity.sh \
  --url http://127.0.0.1:8428 \
  --boundary 2026-09-24T18:00:00Z \
  --window-hours 2 --step 60s
```

It queries a window strictly before and strictly after the boundary for every contract metric and checks two things: that every label-**key** set seen before still appears after, and that identity-stable label combinations (`network_id` plus `device_id`/`eero_id`) are not wholesale replaced. Ordinary device churn is reported as a note; zero overlap is a hard FAIL and means the collector derived different identities. The script is read-only and needs only `curl`, `jq` and `date`.
