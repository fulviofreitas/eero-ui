# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package*.json ./

# Install dependencies with cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci

# Copy frontend source
COPY frontend/ ./

# Build static files
RUN npm run build


# ============================================
# Stage 2: Download VictoriaMetrics
# ============================================
FROM alpine:latest AS vm-downloader

ARG TARGETARCH
ARG VM_VERSION=v1.96.0

RUN apk add --no-cache wget && \
    # Map Docker TARGETARCH to VictoriaMetrics arch naming
    if [ "$TARGETARCH" = "arm64" ]; then \
        VM_ARCH="arm64"; \
    else \
        VM_ARCH="amd64"; \
    fi && \
    wget -qO- "https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/${VM_VERSION}/victoria-metrics-linux-${VM_ARCH}-${VM_VERSION}.tar.gz" | \
    tar -xzf - -C /tmp && \
    chmod +x /tmp/victoria-metrics-prod


# ============================================
# Stage 3: Production Runtime
# ============================================
FROM python:3.14-slim AS runtime

# OCI Image Labels (https://github.com/opencontainers/image-spec/blob/main/annotations.md)
LABEL org.opencontainers.image.title="eero-ui" \
      org.opencontainers.image.description="A modern web dashboard for managing eero mesh WiFi networks with embedded metrics" \
      org.opencontainers.image.url="https://github.com/fulviofreitas/eero-ui" \
      org.opencontainers.image.source="https://github.com/fulviofreitas/eero-ui" \
      org.opencontainers.image.documentation="https://github.com/fulviofreitas/eero-ui/wiki" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="fulviofreitas"

WORKDIR /app

# Install uv (fast Python package installer) and curl (for healthcheck)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    procps

# Copy VictoriaMetrics binary (~15MB)
COPY --from=vm-downloader /tmp/victoria-metrics-prod /usr/local/bin/victoria-metrics

# Copy backend dependencies
COPY backend/pyproject.toml ./backend/

# Install Python dependencies with uv and cache mount for faster rebuilds
# Note: eero-prometheus-exporter is declared in pyproject.toml
# and includes eero-api as a transitive dependency
WORKDIR /app/backend
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    uv pip install --system .

# Copy backend source
COPY backend/app ./app

# Copy built frontend from previous stage
WORKDIR /app
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Copy container start script
COPY container-start.sh /app/container-start.sh
RUN chmod +x /app/container-start.sh

# Create data directories
# - /data/victoria-metrics: Time-series storage for VictoriaMetrics
# - /data/session: Session storage shared between FastAPI and eero-prometheus-exporter
RUN mkdir -p /data/victoria-metrics /data/session && chmod -R 755 /data

# Set environment variables
ENV EERO_DASHBOARD_HOST=0.0.0.0
ENV EERO_DASHBOARD_PORT=8000
ENV EERO_DASHBOARD_DEBUG=false
ENV EERO_DASHBOARD_COOKIE_FILE=/data/session/session.json
# Metrics collection configuration
ENV EERO_DASHBOARD_COLLECTION_INTERVAL=60
ENV EERO_DASHBOARD_METRICS_RETENTION=1y
ENV EERO_DASHBOARD_METRICS_ENDPOINT_ENABLED=false
# Shared session path for eero-prometheus-exporter
ENV EERO_EXPORTER_SESSION_PATH=/data/session/exporter-session.json

# Expose port (FastAPI only - VictoriaMetrics and exporter are internal)
EXPOSE 8000

# Run all services via container start script
WORKDIR /app
CMD ["/app/container-start.sh"]
