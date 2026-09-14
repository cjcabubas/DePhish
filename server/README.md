# DePhish server

Express/Mongoose MVC backend for accounts and combined phishing scans. React is the view layer; the Python service handles message classification.

## Run

```powershell
npm ci
npm start
```

The default address is `http://127.0.0.1:5000`. Use `npm run dev` for automatic restarts during development. The ML service must also run on port 8000 for scans.

## Configure MongoDB Atlas

1. Copy `.env.example` to `.env` if no local file exists.
2. Set `MONGODB_URI` to the Atlas driver connection string. The project owner must allow the server's public IP in Atlas Network Access and grant the database user appropriate access.
3. Set `SESSION_SECRET` to a private random value of at least 32 characters. Generate one locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

4. Optionally set `DB_NAME` to override the database in the URI. `COLLECTION_NAME` selects the scan-history collection (default `scan_reports`). It does not rename the users collection.
5. Restart Express. `/health` returns HTTP 200 with `ready: true` when accounts are available.

Users and sessions use the `users` and `sessions` collections. Signed-in scans save their final combined result and a short message title in `scan_reports`; anonymous scans are not persisted. History is scoped to the authenticated user; older records without an owner are not exposed. Credentials belong only in the ignored `.env` or deployment secret settings. Keep committed secret values blank. The server loads `.env` from this folder regardless of the working directory.

If Atlas is missing or fails at startup, account routes return 503 while scanning stays available. Resolve the connection issue and restart to enable accounts.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/scans` | Current user history, limit 1–100 |
| POST | `/api/scans/analyze` | Classify a message and include automatic link risk |
| POST | `/api/links/check` | Inspect one public URL |
| POST | `/api/auth/signup` | Register and start a session |
| POST | `/api/auth/login` | Log in and rotate the session |
| GET | `/api/auth/me` | Return the current user |
| POST | `/api/auth/logout` | Destroy the session |
| GET | `/health` | Account readiness |

Scans accept `{ "text": "message or URL", "type": "email" }`; type can also be `sms` or `auto`. `ML_API_URL` selects the upstream ML service. Link checks require outbound DNS/HTTPS access but no Atlas or API key. See the [risk policy](../ML/MODEL_UPGRADE.md).

Account POST requests require JSON and `X-DePhish-Client: web`; the frontend supplies both. Passwords require at least 12 characters and at most 72 UTF-8 bytes. Signup always creates a regular user. Admin roles must be assigned through trusted administration.

## Structure and deployment

`src/models` defines database access, `src/services` contains business logic, `src/controllers` handles requests, and `src/routes` declares endpoints. Configuration and middleware remain separate.

Sessions use HttpOnly, SameSite=Lax cookies and MongoDB storage. Production requires HTTPS, `NODE_ENV=production`, exact `CLIENT_ORIGINS`, and a same-origin proxy for Express routes. Set `TRUST_PROXY=1` only behind one trusted proxy. Multiple server instances need shared rate limits.

Email verification, password reset, and report/admin APIs are not implemented.

## Tests

```powershell
npm test
```

Tests cover account contracts, session handling, validation, link safety, and combined risk decisions. Account tests use isolated in-memory substitutes; they do not create Atlas users.
