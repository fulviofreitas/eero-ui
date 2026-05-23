# ⚙️ Configuration

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EERO_DASHBOARD_HOST` | Server bind address | `0.0.0.0` |
| `EERO_DASHBOARD_PORT` | Server port | `8000` |
| `EERO_DASHBOARD_DEBUG` | Enable debug logging and `/api/docs` | `false` |
| `EERO_DASHBOARD_SESSION_SECRET` | **Required.** Session encryption key | *(none — must be set)* |
| `EERO_DASHBOARD_COOKIE_FILE` | Path to the Eero session file | `/data/session/session.json` (Docker) / `~/.eero-dashboard/session.json` (local) |
| `EERO_DASHBOARD_COLLECTION_INTERVAL` | Metrics scrape interval, in seconds | `60` |
| `EERO_DASHBOARD_METRICS_RETENTION` | How long VictoriaMetrics keeps data (e.g., `30d`, `6m`, `1y`) | `1y` |
| `EERO_DASHBOARD_METRICS_ENDPOINT_ENABLED` | Expose `/metrics` for external Prometheus scraping | `false` |
| `EERO_DASHBOARD_VICTORIA_METRICS_URL` | URL of the VictoriaMetrics instance | `http://127.0.0.1:8428` |
| `EERO_EXPORTER_SESSION_PATH` | Shared session path for the embedded exporter | `/data/session/exporter-session.json` |

## Session Secret

For production, always set a strong session secret:

```bash
export EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)
```

The `start.sh` script auto-generates and saves this to `.env` on first run.

## Debug Mode

Enable debug mode for detailed logging:

```bash
EERO_DASHBOARD_DEBUG=true uvicorn app.main:app --reload
```

This also enables the interactive API docs at `/api/docs`.

## Metrics Storage

Metrics are collected by the embedded `eero-prometheus-exporter` and stored in an embedded VictoriaMetrics instance.

- **Collection interval** — `EERO_DASHBOARD_COLLECTION_INTERVAL` sets how often the exporter scrapes the Eero API (default `60` seconds).
- **Retention** — `EERO_DASHBOARD_METRICS_RETENTION` sets how long VictoriaMetrics keeps the data. Accepted suffixes: `d` (days), `w` (weeks), `m` (months), `y` (years). Examples: `30d`, `6m`, `1y` (default).
- **Storage size** — There is no hard cap on the number of metrics; old data is dropped only when it exceeds the retention period. Disk usage grows with the number of devices and the collection interval.

### Expose `/metrics` for external Prometheus

If you want to scrape the metrics from your own Prometheus or Grafana setup:

```bash
EERO_DASHBOARD_METRICS_ENDPOINT_ENABLED=true
```

This exposes a proxied `/metrics` endpoint on the dashboard's port.
