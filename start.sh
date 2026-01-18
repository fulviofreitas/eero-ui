#!/bin/bash
# Start eero-ui dashboard
#
# Usage:
#   ./start.sh              # Start normally (use cached build)
#   ./start.sh --rebuild    # Force rebuild with latest dependencies

set -e

# Parse arguments
REBUILD=false
for arg in "$@"; do
    case $arg in
        --rebuild|-r)
            REBUILD=true
            shift
            ;;
    esac
done

# Generate session secret if not set
# Persist it in .env so it survives restarts
if [ -z "$EERO_DASHBOARD_SESSION_SECRET" ]; then
    if [ -f .env ] && grep -q "EERO_DASHBOARD_SESSION_SECRET" .env 2>/dev/null; then
        echo "🔐 Loading session secret from .env..."
        export $(grep "EERO_DASHBOARD_SESSION_SECRET" .env | xargs)
    else
        echo "🔐 Generating new session secret..."
        export EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)
        # Save to .env for persistence
        echo "EERO_DASHBOARD_SESSION_SECRET=$EERO_DASHBOARD_SESSION_SECRET" >> .env
        echo "   Saved to .env for future restarts"
    fi
fi

# Rebuild if requested (fetches latest eero-api from GitHub)
if [ "$REBUILD" = true ]; then
    echo "🔄 Rebuilding container (fetching latest dependencies)..."
    docker compose down 2>/dev/null || true
    docker compose build --no-cache
fi

echo "🚀 Starting eero-ui..."
docker compose up -d

# Wait for container to be healthy
echo "⏳ Waiting for service to be ready..."
timeout=30
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
        echo ""
        echo "✅ eero-ui is running!"
        echo ""
        echo "   🌐 Open in browser: http://localhost:8000"
        echo ""
        echo "   📋 Useful commands:"
        echo "      docker compose logs -f      # View logs"
        echo "      docker compose down         # Stop"
        echo "      ./start.sh --rebuild        # Update dependencies"
        echo ""
        exit 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
    printf "."
done

echo ""
echo "⚠️  Service started but health check timed out."
echo "   Check logs with: docker compose logs"
echo "   Try opening: http://localhost:8000"
