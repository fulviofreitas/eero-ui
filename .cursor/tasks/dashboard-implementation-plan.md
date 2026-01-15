# Eero UI - Phased Implementation Plan

**Created:** January 2026 | **Status:** Active

---

## Overview

This document outlines the phased approach to building the Eero UI dashboard. This is a **standalone project** that depends on [eero-client](https://github.com/fulviofreitas/eero-client) from GitHub.

---

## Phase 0: Foundation & Architecture (This Document)
**Duration:** 1 day | **Status:** ✅ Complete

- [x] Review eero-client API surface
- [x] Design frontend architecture
- [x] Document key decisions and tradeoffs
- [x] Define file structure
- [x] Create phased implementation plan

**Deliverables:**
- `frontend-architecture.md`
- `dashboard-implementation-plan.md`

---

## Phase 1: Backend API Proxy
**Duration:** 2 days | **Dependencies:** None

Create a thin FastAPI wrapper that exposes eero-client functionality via REST.

### Tasks

1. **Project Setup**
   - [ ] Create `eero-dashboard/` directory at project root
   - [ ] Create `backend/` subdirectory with FastAPI structure
   - [ ] Add `requirements.txt` with dependencies
   - [ ] Create `Dockerfile` for containerized deployment

2. **Core API Routes**
   - [ ] `POST /api/auth/login` - Start login flow
   - [ ] `POST /api/auth/verify` - Verify OTP code
   - [ ] `POST /api/auth/logout` - End session
   - [ ] `GET /api/auth/status` - Check auth status

3. **Network Routes**
   - [ ] `GET /api/networks` - List all networks
   - [ ] `GET /api/networks/{id}` - Get network details
   - [ ] `POST /api/networks/{id}/speedtest` - Run speed test

4. **Device Routes**
   - [ ] `GET /api/devices` - List all devices
   - [ ] `GET /api/devices/{id}` - Get device details
   - [ ] `POST /api/devices/{id}/block` - Block device
   - [ ] `POST /api/devices/{id}/unblock` - Unblock device
   - [ ] `PUT /api/devices/{id}/nickname` - Set nickname

5. **Eero Node Routes**
   - [ ] `GET /api/eeros` - List all eero nodes
   - [ ] `GET /api/eeros/{id}` - Get eero details
   - [ ] `POST /api/eeros/{id}/reboot` - Reboot eero

6. **Profile Routes**
   - [ ] `GET /api/profiles` - List all profiles
   - [ ] `POST /api/profiles/{id}/pause` - Pause profile
   - [ ] `POST /api/profiles/{id}/unpause` - Unpause profile

### Acceptance Criteria
- [ ] All endpoints return proper JSON responses
- [ ] Error responses follow consistent format
- [ ] Session management works correctly
- [ ] Can run via `uvicorn` with hot reload

---

## Phase 2: Svelte Project Setup
**Duration:** 1 day | **Dependencies:** Phase 1 (for API testing)

### Tasks

1. **Project Initialization**
   - [ ] Create `frontend/` subdirectory
   - [ ] Initialize SvelteKit project with TypeScript
   - [ ] Configure for SPA mode (no SSR)
   - [ ] Set up Vite proxy for development

2. **Styling Foundation**
   - [ ] Configure CSS variables for theming
   - [ ] Create base utility classes
   - [ ] Define color palette (dark theme, operations-focused)
   - [ ] Set up typography with monospace accents

3. **Development Environment**
   - [ ] Hot reload working
   - [ ] TypeScript strict mode
   - [ ] Prettier + ESLint configured
   - [ ] Path aliases configured (`$lib/`, `$api/`, etc.)

### Acceptance Criteria
- [ ] `npm run dev` starts Svelte dev server
- [ ] Can proxy requests to FastAPI backend
- [ ] TypeScript compiling without errors

---

## Phase 3: State Management & API Client
**Duration:** 2 days | **Dependencies:** Phase 2

### Tasks

1. **TypeScript Types**
   - [ ] Define `Network`, `Device`, `Eero`, `Profile` interfaces
   - [ ] Define API response types
   - [ ] Define store state types

2. **API Client Layer**
   - [ ] Create fetch wrapper with error handling
   - [ ] Add request/response interceptors
   - [ ] Implement retry logic for transient failures
   - [ ] Add loading state management

3. **Svelte Stores**
   - [ ] `authStore` - Authentication state
   - [ ] `networkStore` - Network data + selected network
   - [ ] `deviceStore` - Device list + actions
   - [ ] `eeroStore` - Eero node data + actions
   - [ ] `uiStore` - Filters, modals, toasts

4. **Derived Stores**
   - [ ] `filteredDevices` - Filtered by search/status
   - [ ] `onlineDevices` / `offlineDevices` - Status-based
   - [ ] `gatewayEero` - Primary gateway node

### Acceptance Criteria
- [ ] Stores update reactively
- [ ] API errors surface to UI
- [ ] Loading states work correctly
- [ ] TypeScript types provide autocomplete

---

## Phase 4: Read-Only Views
**Duration:** 3 days | **Dependencies:** Phase 3

### Tasks

1. **Layout Components**
   - [ ] `Header` - Logo, network selector, user menu
   - [ ] `Sidebar` - Navigation links
   - [ ] `PageContainer` - Consistent page wrapper

2. **Dashboard View**
   - [ ] Network status card (online/offline indicator)
   - [ ] Quick stats (device count, eero count)
   - [ ] Recent speed test results
   - [ ] Health indicators

3. **Devices View**
   - [ ] Device list with virtual scrolling
   - [ ] Device row with: name, IP, MAC, status, connection type
   - [ ] Signal strength indicator
   - [ ] Connected eero badge

4. **Eeros View**
   - [ ] Eero card grid layout
   - [ ] Status indicator (online/offline)
   - [ ] Connected client count
   - [ ] Model and firmware info
   - [ ] Mesh quality visualization

5. **Common Components**
   - [ ] `StatusBadge` - Online/Offline/Paused states
   - [ ] `SignalStrength` - Bars indicator
   - [ ] `LoadingSkeleton` - Loading placeholders
   - [ ] `EmptyState` - No data states

### Acceptance Criteria
- [ ] All views render correctly with real data
- [ ] Loading states display during fetches
- [ ] Error states handle API failures
- [ ] Responsive on desktop and tablet

---

## Phase 5: Write Operations
**Duration:** 2 days | **Dependencies:** Phase 4

### Tasks

1. **Action Components**
   - [ ] `ActionMenu` - Dropdown with device actions
   - [ ] `ConfirmDialog` - Confirmation modal
   - [ ] `Toast` - Success/error notifications

2. **Device Actions**
   - [ ] Block/Unblock device
   - [ ] Edit device nickname
   - [ ] Optimistic UI updates
   - [ ] Rollback on failure

3. **Profile Actions**
   - [ ] Pause/Unpause internet access
   - [ ] Visual feedback for paused state

4. **Eero Actions**
   - [ ] Reboot eero (with confirmation)
   - [ ] Show reboot in-progress state

5. **Error Handling**
   - [ ] Display error toasts
   - [ ] Retry failed operations
   - [ ] Clear error messages

### Acceptance Criteria
- [ ] All write operations work correctly
- [ ] Optimistic updates feel instant
- [ ] Failures show clear error messages
- [ ] Confirmation dialogs prevent accidents

---

## Phase 6: Rich Interactions
**Duration:** 2 days | **Dependencies:** Phase 5

### Tasks

1. **Search & Filter**
   - [ ] Global search bar
   - [ ] Filter by connection status
   - [ ] Filter by connection type (wired/wireless)
   - [ ] Filter by eero node
   - [ ] URL-synced filter state

2. **Real-time Updates**
   - [ ] Polling for data refresh (30s interval)
   - [ ] Manual refresh button
   - [ ] "Last updated" timestamp
   - [ ] Diff detection (highlight changes)

3. **Advanced Device List**
   - [ ] Sortable columns
   - [ ] Bulk selection
   - [ ] Bulk actions (pause multiple)
   - [ ] Export to CSV

4. **Charts & Visualizations**
   - [ ] Speed test history chart
   - [ ] Device connection timeline (if data available)
   - [ ] Bandwidth usage (if Eero Plus)

### Acceptance Criteria
- [ ] Filtering feels instant
- [ ] Polling doesn't cause UI flicker
- [ ] Bulk operations work correctly
- [ ] Charts render without performance issues

---

## Phase 7: Polish & Documentation
**Duration:** 2 days | **Dependencies:** Phase 6

### Tasks

1. **UX Polish**
   - [ ] Keyboard navigation
   - [ ] Focus management
   - [ ] Smooth transitions
   - [ ] Empty states for all views

2. **Error States**
   - [ ] Network error page
   - [ ] Session expired handling
   - [ ] Rate limit feedback

3. **Documentation**
   - [ ] README with setup instructions
   - [ ] Environment variables documentation
   - [ ] Deployment guide
   - [ ] Screenshots

4. **Testing**
   - [ ] Component unit tests
   - [ ] API integration tests
   - [ ] End-to-end smoke tests

### Acceptance Criteria
- [ ] Dashboard feels polished
- [ ] No console errors in production
- [ ] Documentation is complete
- [ ] Can deploy with minimal configuration

---

## Installation

```bash
# Clone the repository
git clone https://github.com/fulviofreitas/eero-ui.git
cd eero-ui

# Start the backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -e .  # Installs dependencies including eero-client from GitHub
uvicorn app.main:app --reload

# Start the frontend (development)
cd ../frontend
npm install
npm run dev

# Or: Production build
npm run build
# Served by FastAPI at /
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to First Meaningful Paint | < 1.5s |
| Lighthouse Performance Score | > 90 |
| Device list with 100 devices | < 100ms render |
| Write operation feedback | < 200ms |
| Zero runtime errors | In production logs |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Eero API changes | Medium | High | Version pinning, integration tests |
| Session expiry during use | Low | Medium | Clear error message, auto-redirect to login |
| Rate limiting | Low | Low | Caching, exponential backoff |
| Large device count | Low | Medium | Virtual scrolling, pagination |

---

## Appendix: Command Reference

```bash
# Development
npm run dev          # Start Svelte dev server
uvicorn app.main:app --reload  # Start FastAPI with reload

# Production
npm run build        # Build Svelte for production
uvicorn app.main:app --workers 4  # Production server

# Testing
npm run test         # Run Svelte tests
pytest               # Run Python tests
```
