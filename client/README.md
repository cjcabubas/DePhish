# DePhish frontend

React/Vite interface for Email/SMS scanning and accounts. See the [root guide](../README.md) to start all three services.

Run these commands from the `client` folder:

```powershell
npm ci
npm run dev
```

Paste a message or URL into the existing scanner. A scan automatically includes link evidence in its result; there is no separate link field or inspection button.

## API routing

Vite forwards `/api/scans`, `/api/links`, and `/api/auth` to Express on port 5000. Other `/api` routes go to ML on port 8000. Optional proxy overrides are in `.env.example`; restart Vite after changing them.

For deployment, serve the frontend and Express API routes on the same origin using a reverse proxy. An optional `VITE_SCAN_API_URL` overrides the scan origin; cross-origin deployments require corresponding server configuration. Never put secrets in `VITE_` variables: they are public browser configuration.

Signed-in history and dashboard statistics are loaded from the authenticated Express API. Guest reports are persisted server-side when MongoDB is available, while browser history stays in page memory and resets on refresh or account changes. Dashboards show all-time totals, assessment breakdowns, 30-day UTC activity, and common indicators. Users see their own scans; admins see aggregates including guest reports. Agree to ToS opens an empty dialog with a checkbox and Agree/Cancel buttons; checking the box and selecting Agree enables scanning. This remains a placeholder, with no legal text or server-side agreement enforcement. Community report submission and review remain in development.

Successful scans keep the loading state visible for at least 1.2 seconds. Network work starts immediately; slow scans have no additional delay and errors appear promptly. The loading animation respects reduced-motion preferences. Rate-limit responses show a readable wait-and-retry message.

Scan results use plain-language verdicts and indicator names, short explanations, matching quotes, and practical next steps. One Technical details section contains relevant wording, context, and link inspection facts. Model thresholds, versions, evaluation statistics, and validation-status notes belong in project documentation rather than user-facing results. Unfinished-feature notices remain visible. The presentation also applies to earlier saved results through stable indicator categories; wording changes do not alter model scoring or API evidence. Each detected link shows inspection status, relevant failures, and extra risk points; zero points does not imply a completed check or a safe destination.

## Checks

```powershell
npm test
npm run build
```
