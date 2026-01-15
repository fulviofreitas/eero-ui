#!/bin/bash
# Start eero-ui dashboard

set -e

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
        echo "      docker compose logs -f   # View logs"
        echo "      docker compose down      # Stop"
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
