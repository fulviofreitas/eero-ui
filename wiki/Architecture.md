# 🏗️ Architecture

## System Overview

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

## Why a Backend Proxy?

| Benefit | Description |
|---------|-------------|
| 🔒 **Security** | Eero session tokens stay server-side, never exposed to browser |
| ♻️ **Reuse** | Leverages existing [eero-client](https://github.com/fulviofreitas/eero-client) Python SDK |
| ⚡ **Caching** | Backend can cache API responses (60s TTL) |
| 🛡️ **Rate Limiting** | Protects against accidental API abuse |

## Code Structure

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

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant Backend
    participant Eero Cloud
    
    User->>Dashboard: Enter email/phone
    Dashboard->>Backend: POST /api/auth/login
    Backend->>Eero Cloud: Request OTP
    Eero Cloud-->>User: Send OTP via SMS/email
    User->>Dashboard: Enter OTP
    Dashboard->>Backend: POST /api/auth/verify
    Backend->>Eero Cloud: Validate OTP
    Eero Cloud-->>Backend: Session token (30-day expiry)
    Backend-->>Dashboard: Set httpOnly cookie
```
