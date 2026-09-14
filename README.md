# DePhish

Email and SMS phishing scanner with message classification, automatic link checks, and MongoDB-backed accounts.

## Run locally

Requirements: Node.js 22.12+ and Python 3.11+. Run each service in a separate terminal from the repository root.

**1. ML service**

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ML/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn ML.src.api.main:app --host 127.0.0.1 --port 8000
```

The trained model is included; retraining is not required.

**2. Express server**

```powershell
cd server
npm ci
npm start
```

For accounts, copy `server/.env.example` to `server/.env` on a fresh checkout and configure Atlas and a session secret. Do not overwrite an existing `.env`. Scanning works without Atlas.

**3. Frontend**

```powershell
cd client
npm ci
npm run dev
```

Open the URL printed by Vite. Keep all three services running. Restart Express after configuration changes, ML after model changes, and Vite after proxy changes.

## What works

- Email/SMS scanning, including a URL pasted into the message field.
- Automatic domain registration, age, redirect, and TLS checks for up to three unique links.
- Combined message and link risk score with explanations.
- Signup, login/logout, and MongoDB sessions when Atlas is configured.
- Private persisted scan history for signed-in users; anonymous history lasts for the page session.

Reports/admin statistics remain demo content; learning modules are not implemented. Domain records do not establish who created a website. Link risk weights are provisional, and Filipino/Taglish detection is not validated.

## Project guides

- [Frontend](client/README.md)
- [Express and Atlas setup](server/README.md)
- [ML service](ML/README.md)
- [Model evaluation and link-risk policy](ML/MODEL_UPGRADE.md)

Local `.env` files, datasets, dependencies, and generated reports are excluded from Git. Committed environment templates contain no secrets.
