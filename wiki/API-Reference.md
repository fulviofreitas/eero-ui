# 📡 API Reference

The backend exposes these REST endpoints. Full interactive docs available at `/api/docs` in debug mode.

## 🔐 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/status` | Check auth status |
| `POST` | `/api/auth/login` | Start login (request OTP) |
| `POST` | `/api/auth/verify` | Verify OTP code |
| `POST` | `/api/auth/logout` | End session |

## 🌐 Networks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/networks` | List networks |
| `GET` | `/api/networks/{id}` | Get network details |
| `POST` | `/api/networks/{id}/speedtest` | Run speed test |

## 📱 Devices

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/devices` | List devices |
| `GET` | `/api/devices/{id}` | Get device details |
| `POST` | `/api/devices/{id}/block` | Block device |
| `POST` | `/api/devices/{id}/unblock` | Unblock device |
| `PUT` | `/api/devices/{id}/nickname` | Set nickname |

## 📶 Eeros

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/eeros` | List eero nodes |
| `GET` | `/api/eeros/{id}` | Get eero details |
| `POST` | `/api/eeros/{id}/reboot` | Reboot eero |

## 👤 Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/profiles` | List profiles |
| `POST` | `/api/profiles/{id}/pause` | Pause profile |
| `POST` | `/api/profiles/{id}/unpause` | Unpause profile |
