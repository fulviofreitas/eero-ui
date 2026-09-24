#!/bin/bash
# ============================================
# Container Start Script
# ============================================
# Orchestrates the 2 processes inside the container:
# 1. VictoriaMetrics (port 8428, loopback-only, storage only — nothing scrapes it)
# 2. FastAPI (port 8000, exposed) — writes metrics into VictoriaMetrics itself
#    via its own collector and reads them back for the dashboard charts.
#
# Both are supervised as background jobs of THIS script rather than replacing
# it via `exec` (as the previous version did for uvicorn). That means this
# bash process stays alive as PID 1 for the container's whole life, so it can
# forward SIGTERM to each child in turn on `docker stop` instead of both
# being hard-killed the instant Docker's default grace period elapses (which
# is what happened when `exec python -m uvicorn` replaced this process image:
# uvicorn got SIGTERM directly, but VictoriaMetrics — a background job with
# no supervisor left to forward anything to it — never did).
# ============================================

set -uo pipefail

echo "bash version: ${BASH_VERSION}"
# `wait -n PID...` (block until any ONE of the *named* background jobs
# exits, exposing its exit status via $?) requires bash >= 5.1 (released
# 2020). Plain `wait -n` with no PID arguments (block until any background
# job exits) has existed since bash 4.3 (2014) but doesn't tell you *which*
# job finished — we recover that below with `kill -0`. This container's base
# image, python:3.14-slim, has been built on Debian bookworm (12) and trixie
# (13) at various points; both ship bash 5.2.x, so the fast path below is
# expected to run everywhere this image is actually built. The version gate
# is a real runtime check (not just a comment) so a future base-image
# regression fails into the documented, tested bash-4.3-compatible fallback
# instead of silently taking the wrong code path.
BASH_MAJOR="${BASH_VERSINFO[0]}"
BASH_MINOR="${BASH_VERSINFO[1]}"
SUPPORTS_WAIT_N_WITH_PIDS=0
if [ "$BASH_MAJOR" -gt 5 ] || { [ "$BASH_MAJOR" -eq 5 ] && [ "$BASH_MINOR" -ge 1 ]; }; then
    SUPPORTS_WAIT_N_WITH_PIDS=1
fi

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

# Override points for the two service commands, so this script can be
# smoke-run outside a real container (no VictoriaMetrics binary, no backend
# checkout) — see scripts/ for a local dry-run harness of just the
# supervisor/trap logic below, using two `sleep`-based stand-ins.
VM_BIN=${VM_BIN:-victoria-metrics}
UVICORN_CMD=${UVICORN_CMD:-"python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"}
VM_HEALTH_URL=${VM_HEALTH_URL:-http://127.0.0.1:8428/health}
VM_HEALTH_TIMEOUT=${VM_HEALTH_TIMEOUT:-30}
CHILD_STOP_TIMEOUT=${CHILD_STOP_TIMEOUT:-10}

VM_PID=""
API_PID=""
SHUTTING_DOWN=0

# Forward a signal to a PID if it's still alive; a no-op if it's already gone.
forward_signal() {
    local sig="$1" pid="$2"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill -s "$sig" "$pid" 2>/dev/null || true
    fi
}

# Wait up to $1 seconds for PID $2 to exit. Returns 0 if it exited in time,
# 1 on timeout.
wait_for_exit() {
    local timeout="$1" pid="$2" waited=0
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$waited" -ge "$timeout" ]; then
            return 1
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 0
}

# Graceful shutdown on `docker stop` (SIGTERM) or Ctrl-C (SIGINT): forward
# SIGTERM to uvicorn first (so in-flight requests and the collector's
# current cycle can finish), then to VictoriaMetrics, each bounded by
# CHILD_STOP_TIMEOUT so this can't silently outlive Docker's own stop grace
# period. Falls back to SIGKILL per child if the bounded wait expires.
cleanup() {
    if [ "$SHUTTING_DOWN" = "1" ]; then
        return
    fi
    SHUTTING_DOWN=1
    echo ""
    echo "Shutting down services..."

    forward_signal TERM "$API_PID"
    if [ -n "$API_PID" ] && ! wait_for_exit "$CHILD_STOP_TIMEOUT" "$API_PID"; then
        echo "WARNING: FastAPI/uvicorn did not exit within ${CHILD_STOP_TIMEOUT}s of SIGTERM; killing it." >&2
        forward_signal KILL "$API_PID"
    fi

    forward_signal TERM "$VM_PID"
    if [ -n "$VM_PID" ] && ! wait_for_exit "$CHILD_STOP_TIMEOUT" "$VM_PID"; then
        echo "WARNING: victoria-metrics did not exit within ${CHILD_STOP_TIMEOUT}s of SIGTERM; killing it." >&2
        forward_signal KILL "$VM_PID"
    fi

    exit 0
}
trap cleanup SIGTERM SIGINT

# Start VictoriaMetrics in background.
# Storage only: no -promscrape.config, nothing is scraped. eero-ui's own
# collector (running inside FastAPI) pushes samples via the import API, and
# routes/metrics.py reads them back. Loopback-bound; never published.
#
# PID note: `$!` after `cmd | sed &` would capture `sed`'s PID, not
# victoria-metrics's (the last command in a pipeline is what `$!` sees).
# Process substitution (`> >(sed ...) 2>&1 &`) keeps victoria-metrics as the
# only command in the background job, so `$!` is victoria-metrics itself,
# while the `sed` log prefix is preserved on its stdout/stderr.
echo "Starting VictoriaMetrics on 127.0.0.1:8428..."
"$VM_BIN" \
    -storageDataPath=/data/victoria-metrics \
    -retentionPeriod="${METRICS_RETENTION}" \
    -httpListenAddr=127.0.0.1:8428 \
    -search.latencyOffset=0s \
    -loggerLevel=WARN \
    > >(sed 's/^/[victoria] /') 2>&1 &
VM_PID=$!

# Wait for VictoriaMetrics to be ready, but don't block startup forever if it
# is slow or unhealthy. Bounded (default 30s in 1s steps); a timeout is
# logged as a warning, not fatal — FastAPI still starts, and
# routes/metrics.py will simply surface read/write errors at request time
# instead of the whole container hanging on boot.
echo "Waiting for VictoriaMetrics (up to ${VM_HEALTH_TIMEOUT}s)..."
READY=0
for _ in $(seq 1 "$VM_HEALTH_TIMEOUT"); do
    if curl -s "$VM_HEALTH_URL" > /dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done
if [ "$READY" = "1" ]; then
    echo "VictoriaMetrics ready!"
else
    echo "WARNING: VictoriaMetrics did not become ready within ${VM_HEALTH_TIMEOUT}s; continuing anyway." >&2
fi

# Start FastAPI in the background too (no `exec`), so this shell survives to
# supervise both children and forward signals on `docker stop`.
echo "Starting FastAPI on port 8000..."
cd /app/backend || { echo "ERROR: /app/backend not found" >&2; exit 1; }
# shellcheck disable=SC2086  # UVICORN_CMD is an intentional word-split override point for the dry-run harness
$UVICORN_CMD > >(sed 's/^/[api] /') 2>&1 &
API_PID=$!
cd /app || { echo "ERROR: /app not found" >&2; exit 1; }

# Supervise: block until either child exits, then decide what to do. Looped
# because a `wait -n` wakeup isn't guaranteed to be one of our two named
# jobs specifically (most concretely on the bash<5.1 fallback, where `wait
# -n` takes no PID arguments at all) — if neither child looks dead when we
# wake up, it was a spurious/unrelated wakeup and we go back to waiting
# instead of falling through with a misleading exit status.
while :; do
    if [ "$SUPPORTS_WAIT_N_WITH_PIDS" = "1" ]; then
        wait -n "$VM_PID" "$API_PID"
        EXIT_STATUS=$?
    else
        # bash < 5.1 fallback: `wait -n` alone can't target specific jobs,
        # so we don't yet know which of the two exited — `kill -0` below
        # resolves that.
        wait -n
        EXIT_STATUS=$?
    fi

    # A signal-driven shutdown (cleanup(), via the trap) may already be in
    # flight and have caused one or both children to exit — in that case
    # cleanup() owns the exit path and we must not race it or exit twice.
    if [ "$SHUTTING_DOWN" = "1" ]; then
        wait "$API_PID" 2>/dev/null || true
        wait "$VM_PID" 2>/dev/null || true
        exit 0
    fi

    # One of the two children exiting on its own is fatal for the container:
    # terminate the surviving child and exit non-zero so Docker's restart
    # policy kicks in, exactly as it would have on the old
    # `exec python -m uvicorn` if uvicorn itself had crashed.
    if ! kill -0 "$VM_PID" 2>/dev/null; then
        echo "ERROR: victoria-metrics exited unexpectedly (status ${EXIT_STATUS})." >&2
        forward_signal TERM "$API_PID"
        wait_for_exit "$CHILD_STOP_TIMEOUT" "$API_PID" || forward_signal KILL "$API_PID"
        exit "$EXIT_STATUS"
    fi

    if ! kill -0 "$API_PID" 2>/dev/null; then
        echo "ERROR: FastAPI/uvicorn exited unexpectedly (status ${EXIT_STATUS})." >&2
        forward_signal TERM "$VM_PID"
        wait_for_exit "$CHILD_STOP_TIMEOUT" "$VM_PID" || forward_signal KILL "$VM_PID"
        exit "$EXIT_STATUS"
    fi

    # Neither PID looks dead: spurious wakeup, loop back and wait again.
done
