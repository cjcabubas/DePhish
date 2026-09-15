# DePhish frontend

React/Vite interface for Email/SMS scanning and accounts. See the [root guide](../README.md) to start all three services.

```powershell
npm ci
npm run dev
```

Paste a message or URL into the existing scanner. A scan automatically includes link evidence in its result; there is no separate link field or inspection button.

## API routing

Vite forwards `/api/scans`, `/api/links`, and `/api/auth` to Express on port 5000. Other `/api` routes go to ML on port 8000. Optional proxy overrides are in `.env.example`; restart Vite after changing them.

For deployment, serve the frontend and Express API routes on the same origin using a reverse proxy. An optional `VITE_SCAN_API_URL` overrides the scan origin; cross-origin deployments require corresponding server configuration. Never put secrets in `VITE_` variables: they are public browser configuration.

Signed-in history and dashboard statistics are loaded from the authenticated Express API. Guest reports are persisted server-side, while browser history stays in page memory and resets on refresh or account changes. Dashboards show all-time totals, assessment breakdowns, 30-day UTC activity, and common indicators. Users see their own scans; admins see aggregates including guest reports. The scanner has an empty ToS box and checkbox; checking it enables scanning. Community report submission and review remain in development.

Successful scans keep the loading state visible for at least 1.2 seconds. Network work starts immediately; slow scans have no additional delay and errors appear promptly. The loading animation respects reduced-motion preferences. Rate-limit responses show a readable wait-and-retry message.

## Checks

```powershell
npm test
npm run build
```
