# 🔧 Troubleshooting

## Common Issues

### "Not authenticated" error

Your session has expired. Click logout and log in again.

### Speed test takes too long

Speed tests typically take 30-60 seconds. This is normal behavior.

### Device actions fail

Check the backend logs for detailed error messages:

```bash
EERO_DASHBOARD_DEBUG=true uvicorn app.main:app --reload
```

### Connection refused

Make sure both servers are running:

- Backend: port 8000
- Frontend (dev mode): port 5173

### Docker container won't start

1. Check if the port is already in use:
   ```bash
   lsof -i :8000
   ```

2. View container logs:
   ```bash
   docker compose logs -f
   ```

3. Ensure the session secret is set:
   ```bash
   echo $EERO_DASHBOARD_SESSION_SECRET
   ```

### Session lost after restart

Make sure you're using a persistent volume:

```bash
docker run -v eero-data:/data ...
```

Or with docker-compose, the volume is configured automatically.
