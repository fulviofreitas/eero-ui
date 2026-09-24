#!/bin/bash
# ============================================================================
# check-history-continuity.sh — eero-ui 6.0 history continuity check
# (phase-6.0-revamp.md § 8.4.2)
# ============================================================================
#
# Given a VictoriaMetrics base URL and a boundary timestamp (the moment
# collection handed over from eero-prometheus-exporter to eero-ui's own
# collector), runs a `query_range` for each of the eight § 2.3 metrics across
# a window of +/- 2h around the boundary, and reports whether each metric
# returns exactly one series per distinct label set across that window (i.e.
# no split into two disjoint series either side of the boundary).
#
# This is a read-only diagnostic against an existing VictoriaMetrics volume
# that already contains pre-6.0 data written by the embedded exporter — it
# does not write anything and does not require Docker.
#
# Usage:
#   ./scripts/check-history-continuity.sh --url http://127.0.0.1:8428 \
#       --boundary 2026-09-24T12:00:00Z [--window-hours 2] [--step 60s]
#
#   --url URL             VictoriaMetrics base URL (required)
#   --boundary TIMESTAMP  RFC3339 timestamp of the 5.x -> 6.0 cutover (required)
#   --window-hours N      Hours before/after the boundary to query (default: 2)
#   --step DURATION       query_range step, VictoriaMetrics duration syntax (default: 60s)
#
# Prints PASS/FAIL per metric. Exits non-zero if any metric fails.
#
# Requires: curl, jq, date (GNU date or a date supporting -d "@epoch").
# ============================================================================

set -euo pipefail

VM_URL=""
BOUNDARY=""
WINDOW_HOURS=2
STEP="60s"

usage() {
    cat <<'EOF'
Usage: check-history-continuity.sh --url URL --boundary TIMESTAMP [--window-hours N] [--step DURATION]

  --url URL              VictoriaMetrics base URL, e.g. http://127.0.0.1:8428 (required)
  --boundary TIMESTAMP   RFC3339 timestamp of the collection-handover boundary (required)
  --window-hours N       Hours before/after the boundary to query (default: 2)
  --step DURATION        query_range step (default: 60s)
  -h, --help             Show this help
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --url)
            VM_URL="$2"
            shift 2
            ;;
        --boundary)
            BOUNDARY="$2"
            shift 2
            ;;
        --window-hours)
            WINDOW_HOURS="$2"
            shift 2
            ;;
        --step)
            STEP="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [ -z "$VM_URL" ] || [ -z "$BOUNDARY" ]; then
    echo "ERROR: --url and --boundary are required" >&2
    usage >&2
    exit 2
fi

for bin in curl jq date; do
    if ! command -v "$bin" > /dev/null 2>&1; then
        echo "ERROR: required tool not found on PATH: $bin" >&2
        exit 2
    fi
done

BOUNDARY_EPOCH="$(date -u -d "$BOUNDARY" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$BOUNDARY" +%s 2>/dev/null)"
if [ -z "$BOUNDARY_EPOCH" ]; then
    echo "ERROR: could not parse --boundary '${BOUNDARY}' as a timestamp" >&2
    exit 2
fi

WINDOW_SECONDS=$((WINDOW_HOURS * 3600))
START_EPOCH=$((BOUNDARY_EPOCH - WINDOW_SECONDS))
END_EPOCH=$((BOUNDARY_EPOCH + WINDOW_SECONDS))

echo "VictoriaMetrics URL: ${VM_URL}"
echo "Boundary: ${BOUNDARY} (epoch ${BOUNDARY_EPOCH})"
echo "Window: [$(date -u -d "@${START_EPOCH}" 2>/dev/null || date -u -r "${START_EPOCH}" 2>/dev/null), $(date -u -d "@${END_EPOCH}" 2>/dev/null || date -u -r "${END_EPOCH}" 2>/dev/null)] step=${STEP}"
echo ""

METRICS=(
    "eero_up"
    "eero_network_clients_count"
    "eero_speed_download_mbps"
    "eero_speed_upload_mbps"
    "eero_device_connected"
    "eero_device_signal_strength_dbm"
    "eero_device_connection_score_bars"
    "eero_eero_mesh_quality_bars"
)

PASS_COUNT=0
FAIL_COUNT=0

pass() {
    echo "PASS: $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo "FAIL: $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

for metric in "${METRICS[@]}"; do
    response="$(curl -s -G "${VM_URL}/api/v1/query_range" \
        --data-urlencode "query=${metric}" \
        --data-urlencode "start=${START_EPOCH}" \
        --data-urlencode "end=${END_EPOCH}" \
        --data-urlencode "step=${STEP}" || true)"

    status="$(echo "$response" | jq -r '.status // "error"' 2>/dev/null || echo "error")"
    if [ "$status" != "success" ]; then
        fail "${metric}: query_range did not return success (raw: ${response})"
        continue
    fi

    series_count="$(echo "$response" | jq -r '.data.result | length' 2>/dev/null || echo 0)"
    if [ "$series_count" -eq 0 ]; then
        fail "${metric}: no series returned across the boundary window — cannot confirm continuity (metric absent, or no data in this window)"
        continue
    fi

    # Group by label set (excluding __name__) and count occurrences.
    # If names/labels were preserved across the handover, there should be
    # exactly one series per distinct label set spanning the whole window —
    # not two disjoint series (one pre-boundary, one post-boundary) for the
    # same logical entity.
    label_sets="$(echo "$response" | jq -r '.data.result[] | (.metric | to_entries | map(select(.key != "__name__")) | sort_by(.key) | map("\(.key)=\(.value)") | join(",")) ' 2>/dev/null)"
    distinct_label_sets="$(echo "$label_sets" | sort -u | wc -l | tr -d '[:space:]')"

    if [ "$distinct_label_sets" -eq "$series_count" ]; then
        pass "${metric}: ${series_count} series returned, ${distinct_label_sets} distinct label set(s) — one series per label set (no split detected)"
    else
        fail "${metric}: ${series_count} series but only ${distinct_label_sets} distinct label set(s) — possible split series across the boundary (duplicate label sets returned as separate series)"
    fi
done

echo ""
echo "============================================"
echo "  History continuity summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "============================================"

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
exit 0
