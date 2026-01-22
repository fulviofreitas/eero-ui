#!/bin/bash
# ============================================
# Container Start Script
# ============================================
# Orchestrates all 3 processes inside the container:
# 1. eero-prometheus-exporter (port 9118, internal)
# 2. VictoriaMetrics (port 8428, internal)
# 3. FastAPI (port 8000, exposed)
# ============================================

set -e

# Configuration from environment (with defaults)
COLLECTION_INTERVAL=${EERO_DASHBOARD_COLLECTION_INTERVAL:-60}
METRICS_RETENTION=${EERO_DASHBOARD_METRICS_RETENTION:-1y}
SESSION_PATH=${EERO_EXPORTER_SESSION_PATH:-/data/session/exporter-session.json}

echo "============================================"
echo "  eero-ui with Embedded Metrics"
echo "============================================"
echo "  Collection interval: ${COLLECTION_INTERVAL}s"
echo "  Metrics retention: ${METRICS_RETENTION}"
echo "  Exporter session: ${SESSION_PATH}"
echo "============================================"

# Ensure session directory exists
mkdir -p "$(dirname "$SESSION_PATH")"

# WORKAROUND: eero-prometheus-exporter has a bug where --session-file is not
# passed to the collector. Create a symlink from the default location to our
# session path so the collector can find it.
# See: https://github.com/your-repo/eero-prometheus-exporter/issues/XXX
DEFAULT_EXPORTER_SESSION="/root/.config/eero-exporter/session.json"
mkdir -p "$(dirname "$DEFAULT_EXPORTER_SESSION")"
ln -sf "$SESSION_PATH" "$DEFAULT_EXPORTER_SESSION"
echo "  Session symlink: $DEFAULT_EXPORTER_SESSION -> $SESSION_PATH"

# Generate prometheus.yml for VictoriaMetrics scrape config
cat > /app/prometheus.yml <<EOF
global:
  scrape_interval: ${COLLECTION_INTERVAL}s

scrape_configs:
  - job_name: 'eero'
    static_configs:
      - targets: ['127.0.0.1:9118']
    scrape_interval: ${COLLECTION_INTERVAL}s
    scrape_timeout: 30s
EOF

# Cleanup function for graceful shutdown
cleanup() {
    echo ""
    echo "Shutting down services..."
    if [ -n "$EXPORTER_PID" ] && kill -0 "$EXPORTER_PID" 2>/dev/null; then
        kill "$EXPORTER_PID" 2>/dev/null || true
    fi
    if [ -n "$VM_PID" ] && kill -0 "$VM_PID" 2>/dev/null; then
        kill "$VM_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start eero-prometheus-exporter in background
# It will wait for session file to appear before collecting metrics
echo "Starting eero-prometheus-exporter on port 9118..."
eero-exporter serve \
    --host 127.0.0.1 \
    --port 9118 \
    --interval "${COLLECTION_INTERVAL}" \
    --session-file "${SESSION_PATH}" \
    2>&1 | sed 's/^/[exporter] /' &
EXPORTER_PID=$!

# Start VictoriaMetrics in background
echo "Starting VictoriaMetrics on port 8428..."
victoria-metrics \
    -storageDataPath=/data/victoria-metrics \
    -retentionPeriod="${METRICS_RETENTION}" \
    -httpListenAddr=127.0.0.1:8428 \
    -promscrape.config=/app/prometheus.yml \
    -search.latencyOffset=0s \
    -loggerLevel=WARN \
    2>&1 | sed 's/^/[victoria] /' &
VM_PID=$!

# Wait for VictoriaMetrics to be ready (exporter may not be ready until user logs in)
echo "Waiting for VictoriaMetrics..."
until curl -s http://127.0.0.1:8428/health > /dev/null 2>&1; do
    sleep 1
done
echo "VictoriaMetrics ready!"

# Start FastAPI (foreground)
# When user logs in, FastAPI writes session to shared location
# and eero-prometheus-exporter automatically starts collecting
echo "Starting FastAPI on port 8000..."
cd /app/backend
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
