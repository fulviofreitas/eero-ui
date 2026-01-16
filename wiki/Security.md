# 🔒 Security

## What This Dashboard Does

| ✅ | Security Feature |
|----|-----------------|
| ✅ | Stores Eero session tokens server-side only |
| ✅ | Uses httpOnly cookies for session management |
| ✅ | Never logs sensitive tokens |
| ✅ | Requires HTTPS in production (via reverse proxy) |

## What You Should Do

| 🔐 | Recommendation |
|----|----------------|
| 🔐 | Run behind a reverse proxy (nginx, Caddy) with HTTPS |
| 🔐 | Set a strong `EERO_DASHBOARD_SESSION_SECRET` |
| 🔐 | Restrict access to trusted networks/VPN |
| 🔐 | Set proper file permissions on session file |

## Authentication Flow

1. User enters email/phone
2. Eero sends OTP code via SMS/email
3. User enters OTP in dashboard
4. Backend stores Eero session token (30-day expiry)
5. Dashboard uses httpOnly cookie for subsequent requests

## Session Management

Sessions are encrypted and stored server-side. The session secret should be:

- At least 32 bytes (64 hex characters)
- Generated securely: `openssl rand -hex 32`
- Kept confidential (never commit to Git)
- Persistent across container restarts (use `.env` or secrets manager)
