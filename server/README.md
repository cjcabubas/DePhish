# DePhish authentication server

Express/Mongoose MVC template for MongoDB Atlas. React in `client/` is the view layer. The Python ML service remains separate.

## Run before configuring Atlas

From `server/`:

```powershell
npm ci
npm run dev
```

With no MongoDB URI or session secret, the server starts on `127.0.0.1:5000` and returns HTTP 503 for account requests. The frontend displays an unavailable message; no users are simulated or saved. ML scanning continues through its existing proxy.

## Configure Atlas

1. Create an Atlas cluster and a database user with access to the application's database. Allow the server's IP in Atlas network access.
2. Open `server/.env`. If it does not exist on a fresh checkout, copy `server/.env.example` to `server/.env`. Each sensitive setting has a comment explaining what belongs there; its value is deliberately blank.
3. Set `MONGODB_URI` to your Atlas driver connection string, with the database name (for example `dephish`). URL-encode special characters in the database user's password. This is the Atlas database credential, not an application user's password.
4. Generate a session secret and set `SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

5. Restart the server. `GET http://127.0.0.1:5000/health` should return HTTP 200 with `ready: true`.
6. Run `npm run dev` in `client/`. Restart Vite if it was running before its proxy configuration changed.

The database connection and secret stay in `server/.env`, which Git ignores. The server resolves this file relative to its configuration module, independent of the terminal working directory. Keep all sensitive settings blank in committed templates; add actual values only to the local environment file or your deployment secret settings. Never use a `VITE_` variable for either value. Users and sessions are stored in MongoDB; a unique email index is initialized before signup requests are accepted.

## Architecture

- `src/models/User.js`: Mongoose user schema and database queries.
- `src/services/authService.js`: password hashing and credential checks.
- `src/controllers/authController.js`: account actions and session lifecycle.
- `src/routes/authRoutes.js`: endpoints and attempt limits.
- `src/middleware/`: request validation, authentication, and role guard.
- `src/config/env.js`: environment loading and validation.
- `src/app.js`: HTTP/session/security middleware.
- `src/server.js`: database connection and server startup.
- `../client/src/main.jsx`: existing form design connected to real endpoints.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create a regular user and start a session |
| POST | `/api/auth/login` | Verify credentials and rotate the session |
| GET | `/api/auth/me` | Return the authenticated user's public fields |
| POST | `/api/auth/logout` | Destroy the server session and clear its cookie |
| GET | `/health` | Report authentication service readiness |

Signup JSON: `{ "name": "Your name", "email": "you@example.com", "password": "your-long-password" }`. Login requires email and password. POST requests require JSON and `X-DePhish-Client: web`; browser origins must match `CLIENT_ORIGINS`. The frontend sends these automatically and includes cookies. Responses never include passwords or password hashes.

Passwords require at least 12 characters on signup and no more than 72 UTF-8 bytes (bcrypt's input limit). Public signup always sets role `user`, including for addresses beginning with `admin@`. To provision an administrator, first register and then assign the role through a trusted database administration process. Never accept a role from the signup form. Apply `requireAuth` followed by `requireRole('admin')` when adding admin API routes.

## Sessions and deployment

Session IDs use HttpOnly, SameSite=Lax cookies; session data lives in MongoDB, with a seven-day lifetime. Production cookies require HTTPS. Set `NODE_ENV=production` and exact HTTPS `CLIENT_ORIGINS`; proxy `/api/auth` to Express on the same frontend origin. Set `TRUST_PROXY=1` only behind one trusted proxy. Bind `HOST` as needed for your hosting platform.

Vite routes `/api/auth` to port 5000 and other `/api` requests to the ML service on port 8000. `AUTH_API_PROXY_TARGET` changes the local authentication target. This template intentionally uses a same-origin proxy rather than cross-site cookie/CORS configuration.

Account attempts are limited per IP in process memory. A multi-instance deployment needs a shared rate-limit store. Email verification, password reset, account deletion, persistent scan history, reporting, and admin APIs are not implemented by this template. Existing report/admin data remains demo content. Scan history stays in page memory and is cleared on successful login/signup/logout.

## Verification

```powershell
npm test
```

Automated tests use an isolated in-memory user repository and session store to exercise HTTP contracts, hashing, session rotation/revocation, validation, origin protection, rate limits, and role guards. These substitutes are test-only: the running configured server uses Mongoose and connect-mongo. A real Atlas connection, index creation, and persistence across server restarts still need verification after configuration. Invalid Atlas connection settings fail startup without printing secrets.
