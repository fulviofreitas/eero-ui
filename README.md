# Eero UI Dashboard

A production-ready **Svelte** dashboard for managing Eero mesh Wi-Fi networks. Designed for **technical operators and SREs** who need efficient network management tools.

## Dependencies

This dashboard depends on [eero-client](https://github.com/fulviofreitas/eero-client), a modern async Python client for the Eero API. The dependency is automatically installed from GitHub when you install the backend.

## Features

### Read Operations
- **Network Overview**: Status, health indicators, speed test results
- **Device Management**: List, search, filter all connected devices
- **Eero Nodes**: Monitor mesh node status, firmware versions, client counts

### Write Operations
- **Device Control**: Block/unblock devices, set nicknames, prioritize bandwidth
- **Profile Management**: Pause/unpause internet access for device groups
- **Eero Control**: Reboot nodes, toggle LEDs

### UX Features
- Real-time filtering and search
- Optimistic UI updates for instant feedback
- Confirmation dialogs for destructive actions
- Dark theme optimized for operations dashboards

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Svelte Frontend (SPA)                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  Views  │  │Componts │  │ Stores  │  │   API   │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       └────────────┴────────────┴────────────┘              │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│                 (wraps eero-client SDK)                      │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS
                              ▼
                    ┌──────────────────┐
                    │  Eero Cloud API  │
                    └──────────────────┘
```

### Why a Backend Proxy?

1. **Security**: Eero session tokens stay server-side, never exposed to browser
2. **Reuse**: Leverages existing [eero-client](https://github.com/fulviofreitas/eero-client) Python SDK
3. **Caching**: Backend can cache API responses (60s TTL)
4. **Rate Limiting**: Protects against accidental API abuse

---

## Quick Start

### Option A: Docker (Recommended)

The easiest way to run eero-ui is with Docker:

```bash
# Pull and run the pre-built image
docker run -d \
  --name eero-ui \
  -p 8000:8000 \
  -v eero-data:/data \
  ghcr.io/fulviofreitas/eero-ui:latest
```

Or clone and build locally:

```bash
git clone https://github.com/fulviofreitas/eero-ui.git
cd eero-ui
./start.sh
```

Open http://localhost:8000 in your browser.

To rebuild with the latest dependencies (e.g., after eero-client updates):

```bash
./start.sh --rebuild
```

To set a secure session secret:

```bash
# Generate a secret
export EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)

# Start with the secret
docker compose up -d
```

To view logs:

```bash
docker compose logs -f
```

To stop:

```bash
docker compose down
```

To update dependencies (fetches latest eero-client):

```bash
./start.sh --rebuild
```

---

### Option B: Manual Setup

#### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or pnpm

#### 1. Install Backend

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# or: venv\Scripts\activate  # Windows

# Install backend package with dependencies (includes eero-client from GitHub)
pip install -e .

# For development (includes testing tools)
pip install -e ".[dev]"
```

### 2. Install Frontend

```bash
cd frontend

# Install dependencies
npm install
```

### 3. Run Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # macOS/Linux (or venv\Scripts\activate on Windows)
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

> **Note:** Always activate the virtual environment (`source venv/bin/activate`) before running the backend server.

---

## Production Deployment

### Option 1: Combined Server

Build the frontend and serve from FastAPI:

```bash
# Build frontend
cd frontend
npm run build

# Start production server
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

The built frontend is automatically served from `/`.

### Option 2: Docker (Recommended)

Use the included `Dockerfile` and `docker-compose.yml`:

```bash
# Build and run
docker compose up -d

# With custom session secret
EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

Session data is persisted in a Docker volume (`eero-data`).

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EERO_DASHBOARD_HOST` | Server bind address | `0.0.0.0` |
| `EERO_DASHBOARD_PORT` | Server port | `8000` |
| `EERO_DASHBOARD_DEBUG` | Enable debug mode | `false` |
| `EERO_DASHBOARD_COOKIE_FILE` | Path to session file | `~/.eero-dashboard/session.json` |
| `EERO_DASHBOARD_SESSION_SECRET` | Session encryption key | (random) |

---

## Security Considerations

### What This Dashboard Does

- ✅ Stores Eero session tokens server-side only
- ✅ Uses httpOnly cookies for session management
- ✅ Never logs sensitive tokens
- ✅ Requires HTTPS in production (configure via reverse proxy)

### What You Should Do

- 🔒 Run behind a reverse proxy (nginx, Caddy) with HTTPS
- 🔒 Set a strong `EERO_DASHBOARD_SESSION_SECRET`
- 🔒 Restrict access to trusted networks/VPN
- 🔒 Set proper file permissions on session file

### Authentication Flow

1. User enters email/phone
2. Eero sends OTP code via SMS/email
3. User enters OTP in dashboard
4. Backend stores Eero session token (30-day expiry)
5. Dashboard uses httpOnly cookie for subsequent requests

---

## API Reference

The backend exposes these REST endpoints:

### Authentication
- `GET /api/auth/status` - Check auth status
- `POST /api/auth/login` - Start login
- `POST /api/auth/verify` - Verify OTP
- `POST /api/auth/logout` - End session

### Networks
- `GET /api/networks` - List networks
- `GET /api/networks/{id}` - Get network details
- `POST /api/networks/{id}/speedtest` - Run speed test

### Devices
- `GET /api/devices` - List devices
- `GET /api/devices/{id}` - Get device details
- `POST /api/devices/{id}/block` - Block device
- `POST /api/devices/{id}/unblock` - Unblock device
- `PUT /api/devices/{id}/nickname` - Set nickname

### Eeros
- `GET /api/eeros` - List eero nodes
- `GET /api/eeros/{id}` - Get eero details
- `POST /api/eeros/{id}/reboot` - Reboot eero

### Profiles
- `GET /api/profiles` - List profiles
- `POST /api/profiles/{id}/pause` - Pause profile
- `POST /api/profiles/{id}/unpause` - Unpause profile

Full API docs available at `/api/docs` when running in debug mode.

---

## Development

### Frontend Scripts

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run check         # TypeScript check
npm run lint          # Lint code
npm run format        # Format code
npm run test          # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

### Backend Scripts

```bash
uvicorn app.main:app --reload     # Dev server with hot reload
pytest                             # Run tests
pytest --cov=app --cov-report=html # Run tests with coverage
pytest -k "login"                  # Run tests matching pattern
```

### Code Structure

```
eero-ui/
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app
│   │   ├── config.py       # Configuration
│   │   ├── deps.py         # Dependencies (auth, client)
│   │   └── routes/         # API endpoints
│   └── pyproject.toml
│
└── frontend/
    ├── src/
    │   ├── lib/
    │   │   ├── api/        # API client
    │   │   ├── stores/     # Svelte stores
    │   │   └── components/ # UI components
    │   └── routes/         # Pages
    └── package.json
```

### Testing

**Backend Testing** uses pytest with pytest-asyncio for async test support:
- Tests located in `backend/tests/`
- Fixtures in `conftest.py` mock the EeroClient
- Install dev dependencies: `pip install -e ".[dev]"`

**Frontend Testing** uses Vitest with Testing Library and MSW for API mocking:
- Store and component tests in `src/lib/**/*.test.ts`
- MSW handlers in `tests/mocks/handlers.ts`

---

## Related Projects

- **[eero-client](https://github.com/fulviofreitas/eero-client)** - The async Python client for the Eero API that this dashboard uses

---

## Future Roadmap

- [ ] Svelte 5 migration (resolves npm vulnerabilities)
- [ ] WebSocket support for real-time updates
- [ ] Multi-account support
- [ ] Advanced charts and analytics
- [ ] Export device list to CSV
- [ ] Custom themes

---

## Known Issues

- **npm vulnerabilities**: There are currently 12 npm audit vulnerabilities (3 low, 9 moderate) in the frontend dependencies. These are inherited from Svelte 4 and will be resolved with the Svelte 5 migration.

- **Untested UI operations**: Not all write operation buttons have been fully tested against the live Eero API. The following actions may have issues:
  - Run Speed Test
  - Block/Unblock device
  - Rename device (set nickname)
  - Reboot eero
  - Pause/Unpause profile

---

## Troubleshooting

### "Not authenticated" error

Your session has expired. Click logout and log in again.

### Speed test takes too long

Speed tests typically take 30-60 seconds. This is normal.

### Device actions fail

Check the backend logs for detailed error messages:
```bash
EERO_DASHBOARD_DEBUG=true uvicorn app.main:app --reload
```

### Connection refused

Make sure both backend (port 8000) and frontend (port 5173) are running.

---

## License

MIT License
