# ⚙️ Configuration

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EERO_DASHBOARD_HOST` | Server bind address | `0.0.0.0` |
| `EERO_DASHBOARD_PORT` | Server port | `8000` |
| `EERO_DASHBOARD_DEBUG` | Enable debug mode | `false` |
| `EERO_DASHBOARD_COOKIE_FILE` | Path to session file | `~/.eero-dashboard/session.json` |
| `EERO_DASHBOARD_SESSION_SECRET` | Session encryption key | *(random)* |

## Session Secret

For production, always set a strong session secret:

```bash
export EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32)
```

The `start.sh` script auto-generates and saves this to `.env` on first run.

## Debug Mode

Enable debug mode for detailed logging:

```bash
EERO_DASHBOARD_DEBUG=true uvicorn app.main:app --reload
```

This also enables the interactive API docs at `/api/docs`.
