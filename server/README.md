# DePhish server

Express/Mongoose MVC backend for accounts and combined phishing scans. React is the view layer; the Python service handles message classification.

## Run

Run these commands from the `server` folder. Complete the [root setup](../README.md#one-time-setup) first.

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

Users and sessions use the `users` and `sessions` collections. Completed scans save a redacted message, minimized assessment, and redacted title in `scan_reports`. Guests use a null userId and `source: guest`; signed-in scans retain their authenticated owner. Personal history is scoped to that owner. Credentials belong only in the ignored `.env` or deployment secret settings. Keep committed secret values blank. The server loads `.env` from this folder regardless of the working directory.

If Atlas is missing or fails at startup, account routes return 503 and scans stop because consent cannot be recorded. Resolve the connection issue and restart.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/scans` | Current user history, limit 1–100 |
| GET | `/api/scans/stats` | Current user's all-time totals, common indicators, and 30-day UTC activity |
| GET | `/api/scans/admin/stats` | Admin-only aggregate saved-scan statistics across accounts |
| GET | `/api/scans/admin/identifiers` | Legacy scanner observations (not verified threats), limit 1–100 |
| POST | `/api/scans/analyze` | Classify a message and include automatic link risk |
| POST | `/api/links/check` | Inspect one public URL |
| POST | `/api/auth/signup` | Register and start a session |
| POST | `/api/auth/login` | Log in and rotate the session |
| GET | `/api/auth/me` | Return the current user |
| POST | `/api/auth/logout` | Destroy the session |
| GET | `/health` | Account readiness |

Scans accept `{ "text": "message or URL", "type": "auto", "tosAccepted": true, "termsVersion": "1.0" }`; type can also be `email`, `sms`, `url`, or `unknown`. Auto-detection is a structural heuristic, not a verified channel. `ML_API_URL` selects the upstream ML service. Link checks require outbound DNS/HTTPS access but no Atlas or API key. See the [risk policy](../ML/MODEL_UPGRADE.md).

Link inspection reports specific `destination.failure_code` values for DNS/connection failures, timeouts, certificate failures, invalid or missing redirect destinations, redirect loops/limits, restricted access, and remote rate limits. Invalid domain labels are rejected before inspection. Registration lookup failures retain completed destination evidence. HTTP 401/403/429 and unsupported HEAD responses (405/501) leave inspection incomplete and add no broken-link points; these are inspection limitations rather than evidence of phishing. Scan results show the reason beside the affected link.

Account POST requests require JSON and `X-DePhish-Client: web`; the frontend supplies both. Passwords require at least 12 characters and at most 72 UTF-8 bytes. Signup always creates a regular user. Admin roles must be assigned through trusted administration.

## Structure and deployment

`src/models` defines database access, `src/services` contains business logic, `src/controllers` handles requests, and `src/routes` declares endpoints. Configuration and middleware remain separate.

Sessions use HttpOnly, SameSite=Lax cookies and MongoDB storage. Production requires HTTPS, `NODE_ENV=production`, exact `CLIENT_ORIGINS`, and a same-origin proxy for Express routes. Set `TRUST_PROXY=1` only behind one trusted proxy. Multiple server instances need shared rate limits.

Admin totals include account-owned and explicitly marked guest reports, independent of the history page limit. Personal dashboards include only the authenticated owner's scans. Legacy unowned records without a guest source remain excluded. Indicators count once per category per scan. Missing classifications are reported as unclassified; missing activity dates are returned as zero. Admin dashboards expose aggregates without message titles, text, or account identifiers.

Email verification and password reset are not implemented.

## Community reports and admin decisions

Scan History, Reports, and Threat Indicators use separate collections:

- `scan_reports` (or `COLLECTION_NAME`): automated scan history. Scans no longer publish identifiers.
- `reports`: community submissions, redacted content, scanner evidence, candidate indicators, and admin decisions.
- `threat_indicators`: only individually approved candidates from currently verified reports. Legacy `flagged_identifiers` observations are not imported or treated as verified threats.

`POST /api/reports` accepts `message`, `suspiciousUrl`, `senderEmail`, `phone`, `details`, and optional `sourceScanId`, plus `tosAccepted: true` and the current `termsVersion`. At least one message/link/email/phone is required. Combined input is limited to 5,000 characters. An existing scan reference requires authentication and is resolved against that user's unexpired saved scans; client-supplied analysis and status are ignored. Current guest scans can be reported by submitting their original message again.

Consent is recorded before analysis. The existing independent scanner analyzes each submission again, then saves its phishing type, risk score, patterns, link evidence, and review candidates with `status: pending`. Analysis or persistence failure returns an error, not a successful pending receipt. Report submissions never create scan-history records or publish threat indicators.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/reports?status=pending&page=1` | Signed-in user's own reports |
| POST | `/api/reports` | Submit and analyze a report; guests allowed |
| GET | `/api/reports/admin?status=pending&page=1` | Admin review queue |
| PATCH | `/api/reports/:id/status` | Admin Verify, Reject, or reopen as Pending |
| GET | `/api/reports/threat-indicators?page=1` | Admin-only verified indicators |

Lists support pending/verified/rejected status filters and 20 rows per page. Status updates require `{ status, revision, indicatorIds, note, emailReviewed }`. IDs must refer to the report's own candidates. Only `verified` can select indicators; verification can also approve the report without publishing any. Sender emails require explicit spoofing review and a decision note. Ordinary recipient addresses are not extracted as sender candidates. Passwords, OTPs, keys, and other credentials are never valid indicator types.

Admin status updates and indicator publication/retraction run in a MongoDB transaction, requiring Atlas or a replica set. There is no partial-write fallback. Stale revisions return 409. Rejecting or reopening a report removes its indicator contributions; other verified reports' contributions remain. The latest 50 status changes retain the reviewer, timestamp, redacted note, selected candidate IDs, and email-review confirmation.

Reports and their indicator contributions expire 30 days after submission, regardless of status. TTL deletion is asynchronous, so reads also exclude expired records. Re-review does not extend retention. Saved messages and evidence mask personal contacts and recognized secrets. Designated scam contacts and sender-header candidates remain readable only in the private report/review workflow. URL candidates preserve safe paths but remove embedded credentials, query strings, fragments, and recognized token-like path data. A domain is approved separately from a URL, because one malicious page does not prove the entire host is malicious. Pattern-based redaction is not exhaustive; the form asks users to remove unnecessary sensitive information.

The server records consent in `scan_consents` using the exact shared terms, version, timestamp, and hash. Missing consent returns 400; a stale version returns 409. Terms remain in `client/src/data/scanTerms.js`; update their version when changing their text. The privacy contact and account/privacy-request deletion workflows still require completion. Existing historical data is not rewritten.

## Independent scan pipeline

`scanController` validates consent, calls `scanOrchestrator`, then calls `scanPersistenceService`.

- `artifactService`: original/normalized text, canonical URLs/domains/emails/phones/IPs, credential flags, and message type.
- `analyzerClient`: independent Python `/api/classify` and `/api/indicators` requests.
- `urlAnalysisService`: starts bounded link inspection immediately from canonical extracted URLs.
- `riskService`: versioned decision policy. It retains model probability × 100 plus the highest link score (maximum 40), capped at 100. No unvalidated indicator/entity weights are introduced.
- `explanationService`: assembles evidence after the final assessment.
- `retentionService` and `scanPersistenceService`: redact automated scan history and apply expiry. Community reports use a separate repository and admin decision workflow.

The response separates `textAnalysis`, `indicatorAnalysis`, `urlAnalysis`, `entityAnalysis`, `assessment`, and `explanation`. Model probability/confidence are not the combined risk index. Compatibility fields such as `risk_score` and `prediction` remain for history/dashboard readers. An indicator outage is marked unavailable, not reported as zero findings; missing link data adds no points. A failed or invalid model response prevents a complete assessment. All three analyzers begin independently of any verdict.

The saved model retains its own frozen training transforms, including internal lexical URL extraction. Changing those transforms requires retraining, so the canonical artifact extractor replaces duplicate live-inspection and persistence extraction, not the shipped model's learned input semantics.

## Tests

Rate limits are per client IP: 120 total API requests/minute, 30 combined history/dashboard reads/minute, 10 scans/minute, 10 standalone link checks/minute, and 15 login/signup attempts per 15 minutes. Rejections return HTTP 429 and Retry-After; health checks bypass the API budget. Counters are in memory per server process. Shared counters are required when deploying multiple instances. Configure trusted proxies accurately so client IPs are identified correctly.

```powershell
npm test
```

Tests cover account contracts, session handling, validation, link safety, and combined risk decisions. Account tests use isolated in-memory substitutes; they do not create Atlas users.

Optional integration checks run separately from the default suite:

```powershell
$env:ML_INTEGRATION_URL='http://127.0.0.1:8000'
node --test tests/pipeline.integration.test.js
Remove-Item Env:ML_INTEGRATION_URL
$env:DEPHISH_DATABASE_TEST='1'
node --test tests/database.integration.test.js
Remove-Item Env:DEPHISH_DATABASE_TEST
```

The database test uses unique `__dephish_verify_*` collections and drops only those collections afterward. It never touches production scan, consent, user, or registry records. The ML integration test uses in-memory persistence and the reserved `.invalid` suffix for link evidence.

Report transaction integration check (temporary isolated collections only):

```powershell
$env:DEPHISH_REPORT_DATABASE_TEST='1'
node --test tests/reportDatabase.integration.test.js
Remove-Item Env:DEPHISH_REPORT_DATABASE_TEST
```

The test covers publication, retraction, multiple supporting reports, stale revisions, concurrent admin decisions, rollback, and expiry without touching application records.