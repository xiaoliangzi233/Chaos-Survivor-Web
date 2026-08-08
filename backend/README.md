# Survivor Python Backend

Optional FastAPI + SQLite service for persistent progress, same-server leaderboards, and local config administration.

Start locally:

```powershell
.\start-backend.cmd
```

Then open the game with:

```text
http://127.0.0.1:5000/?api=http://127.0.0.1:5010
```

Admin UI:

```text
http://127.0.0.1:5010/admin
```

The default admin token is `local-admin`. Set `ADMIN_TOKEN` before starting for a private token.
