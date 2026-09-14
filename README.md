# Running the connected scanner

Start the ML API from the repository root using Python 3.11+:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ML/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn ML.src.api.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd client
npm ci
npm run dev
```

Open the URL printed by Vite. Email and SMS scans POST `{ text, type }` to
`/api/analyze`; Vite forwards requests to `http://127.0.0.1:8000`.
The checked-in model artifacts are used without retraining.

Copy `client/.env.example` to `client/.env` to change the proxy target. For a
production build, configure a same-origin `/api` reverse proxy to the ML service,
or set `VITE_ML_API_URL` to its reachable origin before running `npm run build`.
`npm run preview` also uses the configured local proxy.

Scores, classifications, indicators, and URLs come from the ML service. Failures
are shown in the scanner with a retry available; no demo score is substituted.
Scan history contains scans from the current page session and resets on refresh.
Authentication, reports, and admin statistics remain the existing demo features.
