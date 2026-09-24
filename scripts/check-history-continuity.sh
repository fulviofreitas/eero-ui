#!/bin/bash
# ============================================================================
# check-history-continuity.sh — eero-ui 6.0 history continuity check
# (phase-6.0-revamp.md § 8.4.2)
# ============================================================================
#
# Given a VictoriaMetrics base URL and a boundary timestamp (the moment
# collection handed over from eero-prometheus-exporter to eero-ui's own
# collector), runs TWO separate `query_range` calls per § 2.3 metric — one
# strictly before the boundary ([boundary-window, boundary-1s]) and one
# strictly after it ([boundary+1s, boundary+window]) — and checks continuity
# across the two independently:
#
#   1. Label-KEY-set continuity: every distinct set of label *names* seen
#      pre-boundary (sorted, ignoring __name__ and ignoring values, since a
#      device's `name`/label *values* may legitimately change) must still
#      appear post-boundary. This catches the collector silently dropping or
#      renaming a label across the handover.
#   2. Identity continuity: using only the identity-stable labels
#      (network_id, and device_id or eero_id where the metric has them —
#      deliberately excluding churn-prone labels like name/mac/manufacturer,
#      see phase-6.0-revamp.md § 2.3's "Rename-driven label churn" note),
#      every pre-boundary identity is compared against the post-boundary
#      identity set. If ALL pre-boundary identities vanish post-boundary
#      (zero overlap) while post-boundary data exists for other identities,
#      that's flagged as a hard FAIL — it means the collector re-derived
#      entirely new identities across the boundary (e.g. a change in
#      extract_id_from_url or its inputs), not ordinary device churn. If SOME
#      but not all identities carry over, that's expected per the plan's
#      documented stale-series/rename-churn behaviour and is reported as an
#      informational note rather than a failure.
#
# A single-window "one series per label set" check (the previous version of
# this script) cannot detect a real split: VictoriaMetrics already
# deduplicates identical label sets into one series within a single query, so
# that check could never fail. Querying pre- and post-boundary windows
# independently and comparing across them is what actually exercises
# continuity.
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
PRE_START_EPOCH=$((BOUNDARY_EPOCH - WINDOW_SECONDS))
PRE_END_EPOCH=$((BOUNDARY_EPOCH - 1))
POST_START_EPOCH=$((BOUNDARY_EPOCH + 1))
POST_END_EPOCH=$((BOUNDARY_EPOCH + WINDOW_SECONDS))

fmt_epoch() {
    date -u -d "@$1" 2>/dev/null || date -u -r "$1" 2>/dev/null
}

echo "VictoriaMetrics URL: ${VM_URL}"
echo "Boundary: ${BOUNDARY} (epoch ${BOUNDARY_EPOCH})"
echo "Pre-boundary window:  [$(fmt_epoch "$PRE_START_EPOCH"), $(fmt_epoch "$PRE_END_EPOCH")]"
echo "Post-boundary window: [$(fmt_epoch "$POST_START_EPOCH"), $(fmt_epoch "$POST_END_EPOCH")]"
echo "step=${STEP}"
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

# jq filter: for each result series, emit the sorted, comma-joined set of
# label KEYS (excluding __name__) — schema shape, ignoring values.
KEYSET_FILTER='[.data.result[] | (.metric | keys | map(select(. != "__name__")) | sort | join(","))] | unique | .[]'

# jq filter: for each result series, emit the sorted, comma-joined
# key=value pairs for ONLY the identity-stable labels (network_id,
# device_id, eero_id) that are present — ignoring name/mac/manufacturer/etc,
# which may legitimately change across the boundary without breaking
# continuity of the underlying entity.
IDENTITY_FILTER='[.data.result[] | (.metric | to_entries | map(select(.key == "network_id" or .key == "device_id" or .key == "eero_id")) | sort_by(.key) | map("\(.key)=\(.value)") | join(","))] | unique | .[]'

query_window() {
    local metric="$1" start="$2" end="$3"
    curl -s -G "${VM_URL}/api/v1/query_range" \
        --data-urlencode "query=${metric}" \
        --data-urlencode "start=${start}" \
        --data-urlencode "end=${end}" \
        --data-urlencode "step=${STEP}" || true
}

for metric in "${METRICS[@]}"; do
    pre_response="$(query_window "$metric" "$PRE_START_EPOCH" "$PRE_END_EPOCH")"
    post_response="$(query_window "$metric" "$POST_START_EPOCH" "$POST_END_EPOCH")"

    pre_status="$(echo "$pre_response" | jq -r '.status // "error"' 2>/dev/null || echo "error")"
    post_status="$(echo "$post_response" | jq -r '.status // "error"' 2>/dev/null || echo "error")"

    if [ "$pre_status" != "success" ] || [ "$post_status" != "success" ]; then
        fail "${metric}: query_range did not return success (pre-status=${pre_status}, post-status=${post_status})"
        continue
    fi

    pre_series_count="$(echo "$pre_response" | jq -r '.data.result | length' 2>/dev/null || echo 0)"
    post_series_count="$(echo "$post_response" | jq -r '.data.result | length' 2>/dev/null || echo 0)"

    if [ "$pre_series_count" -eq 0 ]; then
        echo "SKIP: ${metric}: no pre-boundary data in this window — nothing to check continuity against (metric may be new in 6.0, or the window doesn't reach far enough back)"
        continue
    fi

    if [ "$post_series_count" -eq 0 ]; then
        fail "${metric}: ${pre_series_count} series pre-boundary but ZERO post-boundary — collection did not resume for this metric after the handover"
        continue
    fi

    pre_key_sets="$(echo "$pre_response" | jq -r "$KEYSET_FILTER" 2>/dev/null)"
    post_key_sets="$(echo "$post_response" | jq -r "$KEYSET_FILTER" 2>/dev/null)"

    # (1) Label-key-set continuity: every pre-boundary key-set must still
    # appear post-boundary.
    missing_key_sets=""
    while IFS= read -r ks; do
        [ -z "$ks" ] && continue
        if ! printf '%s\n' "$post_key_sets" | grep -qxF "$ks"; then
            missing_key_sets="${missing_key_sets}[${ks}] "
        fi
    done <<< "$pre_key_sets"

    if [ -n "$missing_key_sets" ]; then
        fail "${metric}: label-key set(s) present pre-boundary are missing post-boundary — differing label keys: ${missing_key_sets}"
        continue
    fi

    pre_identities="$(echo "$pre_response" | jq -r "$IDENTITY_FILTER" 2>/dev/null)"
    post_identities="$(echo "$post_response" | jq -r "$IDENTITY_FILTER" 2>/dev/null)"

    # Metrics with no identity-stable labels at all (e.g. eero_up has no
    # labels) have nothing further to check here — presence in both windows,
    # already confirmed above, is the whole story.
    if [ -z "$pre_identities" ]; then
        pass "${metric}: ${pre_series_count} series pre-boundary, ${post_series_count} post-boundary, label keys match, no identity labels to compare"
        continue
    fi

    # (2) Identity continuity: compare pre- and post-boundary identity sets.
    pre_identity_count=0
    carried_over_count=0
    missing_identities=""
    while IFS= read -r id; do
        [ -z "$id" ] && continue
        pre_identity_count=$((pre_identity_count + 1))
        if printf '%s\n' "$post_identities" | grep -qxF "$id"; then
            carried_over_count=$((carried_over_count + 1))
        else
            missing_identities="${missing_identities}(${id}) "
        fi
    done <<< "$pre_identities"

    if [ "$carried_over_count" -eq 0 ] && [ "$pre_identity_count" -gt 0 ]; then
        fail "${metric}: ALL ${pre_identity_count} pre-boundary identities vanished post-boundary (zero overlap) — differing label keys/identities: ${missing_identities}. This indicates the collector re-derived new identities across the handover, not ordinary device churn."
    elif [ -n "$missing_identities" ]; then
        pass "${metric}: ${carried_over_count}/${pre_identity_count} pre-boundary identities carried over post-boundary; label keys match. Not carried over (expected churn — devices/eeros removed or renamed, see § 2.3 stale-series note): ${missing_identities}"
    else
        pass "${metric}: all ${pre_identity_count} pre-boundary identities carried over post-boundary; label keys match"
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
