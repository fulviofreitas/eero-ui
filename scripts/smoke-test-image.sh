#!/bin/bash
# ============================================================================
# smoke-test-image.sh — eero-ui 6.0 image smoke test (phase-6.0-revamp.md § 8.4.1)
# ============================================================================
#
# Boots the eero-ui image with a seeded session and asserts the container
# shape and metric contract promised by § 2.3 / § 2.6 of the revamp plan:
#
#   1. Exactly one file in /data/session
#   2. Exactly two service processes (victoria-metrics, uvicorn/python) —
#      no eero-exporter process
#   3. No prometheus.yml anywhere in the container
#   4. `eero_up` == 1 in VictoriaMetrics after one collection interval
#   5. Each of the eight § 2.3 metrics returns >=1 sample with the exact
#      label-key set from § 2.3
#   6. GET :8000/metrics is 404 (not the SPA's index.html)
#   7. GET /api/metrics/health with no session cookie is 401
#
# Usage:
#   ./scripts/smoke-test-image.sh --session-file /path/to/seeded-session.json [--image TAG] [--build]
#
#   --image TAG        Image tag to run (default: eero-ui:smoke-test)
#   --build            Build the image from the repo root before running it
#   --session-file F   Path to a pre-authenticated eero session file, mounted
#                       read-only at /data/session/session.json inside the
#                       container. REQUIRED.
#   --interval N       Seconds to wait for one collection cycle (default: 70,
#                       i.e. the default 60s collection interval + 10s grace,
#                       per plan § 8.4.1)
#
# Prints PASS/FAIL per assertion. Exits non-zero if any assertion fails.
#
# Requires: docker, curl, jq. Does not require the repo's Python/Node
# toolchain — it only talks to the running container over the Docker CLI
# and the container's published port.
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults / argument parsing
# ---------------------------------------------------------------------------
IMAGE_TAG="eero-ui:smoke-test"
SESSION_FILE=""
DO_BUILD=0
WAIT_SECONDS=70
CONTAINER_NAME="eero-ui-smoke-test-$$"
HOST_PORT=18000

usage() {
    cat <<'EOF'
Usage: smoke-test-image.sh --session-file FILE [--image TAG] [--build] [--interval N]

  --session-file FILE   Path to a pre-authenticated eero session JSON file (required)
  --image TAG            Image tag to run/build (default: eero-ui:smoke-test)
  --build                Build the image from the repo root before running
  --interval N            Seconds to wait for one collection cycle + grace (default: 70)
  -h, --help              Show this help
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --image)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --session-file)
            SESSION_FILE="$2"
            shift 2
            ;;
        --build)
            DO_BUILD=1
            shift
            ;;
        --interval)
            WAIT_SECONDS="$2"
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

if [ -z "$SESSION_FILE" ]; then
    echo "ERROR: --session-file is required" >&2
    usage >&2
    exit 2
fi

if [ ! -f "$SESSION_FILE" ]; then
    echo "ERROR: session file not found: $SESSION_FILE" >&2
    exit 2
fi

for bin in docker curl jq; do
    if ! command -v "$bin" > /dev/null 2>&1; then
        echo "ERROR: required tool not found on PATH: $bin" >&2
        exit 2
    fi
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

cleanup() {
    docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Build (optional) and run
# ---------------------------------------------------------------------------
if [ "$DO_BUILD" = "1" ]; then
    echo "Building image ${IMAGE_TAG} from ${REPO_ROOT}..."
    docker build -t "$IMAGE_TAG" "$REPO_ROOT"
fi

echo "Starting container ${CONTAINER_NAME} from ${IMAGE_TAG}..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${HOST_PORT}:8000" \
    -e "EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo 0123456789abcdef0123456789abcdef)" \
    -v "${SESSION_FILE}:/data/session/session.json:ro" \
    "$IMAGE_TAG" > /dev/null

echo "Waiting ${WAIT_SECONDS}s for at least one collection cycle..."
sleep "$WAIT_SECONDS"

# ---------------------------------------------------------------------------
# Assertion 1: exactly one file in /data/session
# ---------------------------------------------------------------------------
SESSION_FILE_COUNT="$(docker exec "$CONTAINER_NAME" sh -c 'find /data/session -maxdepth 1 -type f | wc -l' | tr -d '[:space:]')"
if [ "$SESSION_FILE_COUNT" = "1" ]; then
    pass "exactly one file in /data/session"
else
    fail "expected exactly one file in /data/session, found ${SESSION_FILE_COUNT}"
fi

# ---------------------------------------------------------------------------
# Assertion 2: exactly two service processes, no eero-exporter
# ---------------------------------------------------------------------------
PS_OUTPUT="$(docker exec "$CONTAINER_NAME" ps -eo comm 2>/dev/null || true)"
VM_PROC_COUNT="$(echo "$PS_OUTPUT" | grep -c 'victoria-metrics' || true)"
API_PROC_COUNT="$(echo "$PS_OUTPUT" | grep -cE 'uvicorn|python' || true)"
EXPORTER_PROC_COUNT="$(echo "$PS_OUTPUT" | grep -c 'eero-exporter' || true)"

if [ "$VM_PROC_COUNT" -ge 1 ] && [ "$API_PROC_COUNT" -ge 1 ] && [ "$EXPORTER_PROC_COUNT" -eq 0 ]; then
    pass "two service processes present (victoria-metrics, uvicorn/python), no eero-exporter"
else
    fail "process check failed (victoria-metrics=${VM_PROC_COUNT}, api=${API_PROC_COUNT}, exporter=${EXPORTER_PROC_COUNT}); ps output:
${PS_OUTPUT}"
fi

# ---------------------------------------------------------------------------
# Assertion 3: no prometheus.yml anywhere in the container
# ---------------------------------------------------------------------------
PROMETHEUS_YML_COUNT="$(docker exec "$CONTAINER_NAME" sh -c 'find / -xdev -name "prometheus.yml" 2>/dev/null | wc -l' | tr -d '[:space:]')"
if [ "$PROMETHEUS_YML_COUNT" = "0" ]; then
    pass "no prometheus.yml found in the container"
else
    fail "found ${PROMETHEUS_YML_COUNT} prometheus.yml file(s) in the container"
fi

# ---------------------------------------------------------------------------
# Assertion 4: eero_up == 1
# ---------------------------------------------------------------------------
EERO_UP_JSON="$(docker exec "$CONTAINER_NAME" curl -s 'http://127.0.0.1:8428/api/v1/query?query=eero_up' || true)"
EERO_UP_VALUE="$(echo "$EERO_UP_JSON" | jq -r '.data.result[0].value[1] // "missing"' 2>/dev/null || echo "missing")"
if [ "$EERO_UP_VALUE" = "1" ]; then
    pass "eero_up == 1"
else
    fail "eero_up expected 1, got '${EERO_UP_VALUE}' (raw: ${EERO_UP_JSON})"
fi

# ---------------------------------------------------------------------------
# Assertion 5: each of the eight § 2.3 metrics has >=1 sample with the exact
# label-key set (order-insensitive)
# ---------------------------------------------------------------------------
# metric_name:expected_label_keys (comma-separated, sorted alphabetically)
METRIC_SPECS=(
    "eero_up:"
    "eero_network_clients_count:name,network_id"
    "eero_speed_download_mbps:network_id"
    "eero_speed_upload_mbps:network_id"
    "eero_device_connected:connection_type,device_id,manufacturer,mac,name,network_id,source_eero,device_type"
    "eero_device_signal_strength_dbm:band,device_id,manufacturer,name,network_id,source_eero"
    "eero_device_connection_score_bars:connection_type,device_id,manufacturer,name,network_id,source_eero"
    "eero_eero_mesh_quality_bars:eero_id,location,model,network_id"
)

sorted_csv() {
    # Sort a comma-separated list alphabetically, drop empties, re-join.
    echo "$1" | tr ',' '\n' | grep -v '^$' | sort | tr '\n' ',' | sed 's/,$//'
}

for spec in "${METRIC_SPECS[@]}"; do
    metric_name="${spec%%:*}"
    expected_labels_raw="${spec#*:}"
    expected_labels="$(sorted_csv "$expected_labels_raw")"

    result_json="$(docker exec "$CONTAINER_NAME" curl -s "http://127.0.0.1:8428/api/v1/query?query=${metric_name}" || true)"
    sample_count="$(echo "$result_json" | jq -r '.data.result | length' 2>/dev/null || echo 0)"

    if [ "$sample_count" -lt 1 ]; then
        fail "${metric_name}: expected >=1 sample, got ${sample_count}"
        continue
    fi

    # Label keys on the metric, excluding __name__, from the first result.
    actual_labels_raw="$(echo "$result_json" | jq -r '.data.result[0].metric | keys[] | select(. != "__name__")' 2>/dev/null | tr '\n' ',' | sed 's/,$//')"
    actual_labels="$(sorted_csv "$actual_labels_raw")"

    if [ "$actual_labels" = "$expected_labels" ]; then
        pass "${metric_name}: ${sample_count} sample(s), labels match § 2.3 (${actual_labels:-none})"
    else
        fail "${metric_name}: label mismatch — expected [${expected_labels}], got [${actual_labels}]"
    fi
done

# ---------------------------------------------------------------------------
# Assertion 6: GET :8000/metrics is 404, not index.html
# ---------------------------------------------------------------------------
METRICS_STATUS="$(curl -s -o /tmp/smoke-test-metrics-body.$$ -w '%{http_code}' "http://127.0.0.1:${HOST_PORT}/metrics" || echo 000)"
if [ "$METRICS_STATUS" = "404" ]; then
    if grep -qi '<html' /tmp/smoke-test-metrics-body.$$ 2>/dev/null; then
        fail "/metrics returned 404 but body looks like index.html (SPA catch-all leaking through)"
    else
        pass "/metrics returns 404 with a non-HTML body"
    fi
else
    fail "/metrics expected HTTP 404, got ${METRICS_STATUS}"
fi
rm -f /tmp/smoke-test-metrics-body.$$

# ---------------------------------------------------------------------------
# Assertion 7: /api/metrics/health with no session cookie is 401
# ---------------------------------------------------------------------------
HEALTH_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HOST_PORT}/api/metrics/health" || echo 000)"
if [ "$HEALTH_STATUS" = "401" ]; then
    pass "/api/metrics/health with no session returns 401"
else
    fail "/api/metrics/health expected HTTP 401, got ${HEALTH_STATUS}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================"
echo "  Smoke test summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "============================================"
echo "----- container logs (tail) -----"
docker logs --tail 100 "$CONTAINER_NAME" 2>&1 || true

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
exit 0
