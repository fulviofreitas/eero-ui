# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build static files
RUN npm run build


# ============================================
# Stage 2: Production Runtime
# ============================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install git (for pip to clone eero-client) and curl (for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy backend dependencies
COPY backend/pyproject.toml ./backend/

# Install Python dependencies
WORKDIR /app/backend
RUN pip install --no-cache-dir .

# Copy backend source
COPY backend/app ./app

# Copy built frontend from previous stage
WORKDIR /app
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Create data directory for session storage
RUN mkdir -p /data && chmod 755 /data

# Set environment variables
ENV EERO_DASHBOARD_HOST=0.0.0.0
ENV EERO_DASHBOARD_PORT=8000
ENV EERO_DASHBOARD_DEBUG=false
ENV EERO_DASHBOARD_COOKIE_FILE=/data/session.json

# Expose port
EXPOSE 8000

# Run the application
WORKDIR /app/backend
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
