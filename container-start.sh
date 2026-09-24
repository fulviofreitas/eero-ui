#!/bin/bash
# ============================================
# Container Start Script
# ============================================
# Orchestrates the 2 processes inside the container:
# 1. VictoriaMetrics (port 8428, loopback-only, storage only — nothing scrapes it)
# 2. FastAPI (port 8000, exposed) — writes metrics into VictoriaMetrics itself
#    via its own collector and reads them back for the dashboard charts.
# ============================================

set -e

# Configuration from environment (with defaults)
COLLECTION_INTERVAL=${EERO_DASHBOARD_COLLECTION_INTERVAL:-60}
METRICS_RETENTION=${EERO_DASHBOARD_METRICS_RETENTION:-1y}

echo "============================================"
echo "  eero-ui with Embedded Metrics"
echo "============================================"
echo "  Collection interval: ${COLLECTION_INTERVAL}s"
echo "  Metrics retention: ${METRICS_RETENTION}"
echo "============================================"

# Export so the Python collector (FastAPI lifespan) can read it too.
export EERO_DASHBOARD_COLLECTION_INTERVAL="${COLLECTION_INTERVAL}"

# Cleanup function for graceful shutdown.
#
# NOTE on PID bookkeeping: this trap is never actually invoked in normal
# operation, because `exec` below replaces this shell's process image with
# uvicorn, which drops any trap installed in this script. It only runs if the
# script exits before reaching the `exec` (e.g. VictoriaMetrics fails to
# start). The original script's `VM_PID=$!` after `cmd | sed &` was dead
# bookkeeping twice over: `$!` captures the PID of the last command in a
# pipeline (`sed`, not `victoria-metrics`), and the trap never fires anyway
# once `exec` runs. Rather than drop the bookkeeping outright, this fixes the
# PID capture with process substitution so `$!` is `victoria-metrics` itself,
# keeping the `sed` log prefix without putting it in the pipeline.
cleanup() {
    echo ""
    echo "Shutting down services..."
    if [ -n "${VM_PID:-}" ] && kill -0 "$VM_PID" 2>/dev/null; then
        kill "$VM_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start VictoriaMetrics in background.
# Storage only: no -promscrape.config, nothing is scraped. eero-ui's own
# collector (running inside FastAPI) pushes samples via the import API, and
# routes/metrics.py reads them back. Loopback-bound; never published.
echo "Starting VictoriaMetrics on 127.0.0.1:8428..."
victoria-metrics \
    -storageDataPath=/data/victoria-metrics \
    -retentionPeriod="${METRICS_RETENTION}" \
    -httpListenAddr=127.0.0.1:8428 \
    -search.latencyOffset=0s \
    -loggerLevel=WARN \
    > >(sed 's/^/[victoria] /') 2>&1 &
VM_PID=$!

# Wait for VictoriaMetrics to be ready, but don't block startup forever if it
# is slow or unhealthy. Bounded at 30s in 1s steps; a timeout is logged as a
# warning, not a fatal error — FastAPI still starts, and routes/metrics.py
# will simply surface read/write errors at request time instead of the whole
# container hanging on boot.
echo "Waiting for VictoriaMetrics (up to 30s)..."
READY=0
for _ in $(seq 1 30); do
    if curl -s http://127.0.0.1:8428/health > /dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done
if [ "$READY" = "1" ]; then
    echo "VictoriaMetrics ready!"
else
    echo "WARNING: VictoriaMetrics did not become ready within 30s; continuing anyway." >&2
fi

# Start FastAPI (foreground)
echo "Starting FastAPI on port 8000..."
cd /app/backend
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
