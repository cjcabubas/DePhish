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

Users and sessions use the `users` and `sessions` collections. All completed scans save the full message, combined result, and short title in `scan_reports`. Guests use a null userId and `source: guest`; signed-in scans retain their authenticated owner. Personal history is scoped to that owner. Credentials belong only in the ignored `.env` or deployment secret settings. Keep committed secret values blank. The server loads `.env` from this folder regardless of the working directory.

If Atlas is missing or fails at startup, account routes return 503 while scanning stays available. Resolve the connection issue and restart to enable accounts.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/scans` | Current user history, limit 1–100 |
| GET | `/api/scans/stats` | Current user's all-time totals, common indicators, and 30-day UTC activity |
| GET | `/api/scans/admin/stats` | Admin-only aggregate saved-scan statistics across accounts |
| GET | `/api/scans/admin/identifiers` | Admin-only scanner-flagged identifiers, limit 1–100 |
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

Admin totals include account-owned and explicitly marked guest reports, independent of the history page limit. Personal dashboards include only the authenticated owner's scans. Legacy unowned records without a guest source remain excluded. Indicators count once per category per scan. Missing classifications are reported as unclassified; missing activity dates are returned as zero. Admin dashboards expose aggregates without message titles, text, or account identifiers.

Email verification, password reset, and community-report APIs are not implemented.

## Scanner-flagged identifier registry

The scanner UI includes an empty ToS placeholder and requires its checkbox before scanning. Reports record `tosAcknowledged` from that checkbox. This is a placeholder acknowledgement without published terms or a terms version; it does not represent acceptance of a completed legal document. Direct API clients are not gated by the placeholder checkbox.

Final `Phishing` scans automatically upsert links, email addresses, and recognized phone numbers into `flagged_identifiers`, including anonymous scans when MongoDB is ready. `Suspicious` and `Legitimate` scans do not write. A unique key deduplicates identifiers; records contain first/last seen times, detection counts, and the latest scores, indicator categories, model/scoring versions, and optional account/history references. Full message text is not copied into this collection. Up to 30 unique identifiers are recorded per scan.

URL identity includes scheme, hostname, and path, excluding embedded credentials, query parameters, and fragments. Email addresses are lowercased. Philippine mobile numbers normalize to +63; explicitly international numbers retain their dialing prefix. Extraction is conservative and does not validate ownership or global phone-number validity.

`scanner_flagged` means an identifier appeared in a message assessed as phishing. Messages can mention innocent addresses, official links, or recipients; the flag does not establish that each identifier is malicious. The registry is restricted to admins, and does not automatically change future scan scores. Review states are reserved in the schema; a review workflow is not implemented. Database write failures return a registry-status notice while retaining the scan result, and partial writes may have succeeded. The existing Atlas configuration and session secret are required to initialize persistence.

## Tests

Rate limits are per client IP: 120 total API requests/minute, 30 combined history/dashboard reads/minute, 10 scans/minute, 10 standalone link checks/minute, and 15 login/signup attempts per 15 minutes. Rejections return HTTP 429 and Retry-After; health checks bypass the API budget. Counters are in memory per server process. Shared counters are required when deploying multiple instances. Configure trusted proxies accurately so client IPs are identified correctly.

```powershell
npm test
```

Tests cover account contracts, session handling, validation, link safety, and combined risk decisions. Account tests use isolated in-memory substitutes; they do not create Atlas users.
