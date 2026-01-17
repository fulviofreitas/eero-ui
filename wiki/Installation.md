# 🚀 Installation

## 🐳 Docker (Recommended)

The easiest way to run Eero UI:

```bash
# Generate a secure session secret (REQUIRED)
export EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)

# Pull and run the pre-built image
docker run -d \
  --name eero-ui \
  -p 8000:8000 \
  -v eero-data:/data \
  -e EERO_DASHBOARD_SESSION_SECRET \
  ghcr.io/fulviofreitas/eero-ui:latest
```

Or clone and build locally:

```bash
git clone https://github.com/fulviofreitas/eero-ui.git
cd eero-ui
./start.sh
```

> 💡 The session secret is auto-generated on first run and saved to `.env`.

### Docker Commands

```bash
# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild (fetches latest dependencies)
./start.sh --rebuild
```

---

## 🛠️ Manual Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- npm or pnpm

### 1️⃣ Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# or: venv\Scripts\activate  # Windows

# Install with dependencies
pip install -e .

# For development (includes testing tools)
pip install -e ".[dev]"
```

### 2️⃣ Frontend

```bash
cd frontend
npm install
```

### 3️⃣ Run Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173

---

## 🏭 Production Deployment

### Option A: Combined Server

Build the frontend and serve from FastAPI:

```bash
# Build frontend
cd frontend
npm run build

# Start production server
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Option B: Docker Compose

```bash
# Build and run
docker compose up -d

# With custom session secret
EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d
```

Session data persists in a Docker volume (`eero-data`).
