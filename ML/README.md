# DePhish ML Service

FastAPI service for analyzing email and SMS text. It uses a calibrated Linear SVM with word TF-IDF features and rule-derived indicators. The React frontend is in `client/`; see the [project setup guide](../README.md).

## Setup and run

Run these commands from the repository root. Create the environment only if `.venv` does not already exist:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ML/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn ML.src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

The trained artifacts in `ML/models/` are included, so retraining is not required to run scans. Keep the scikit-learn version pinned in `requirements.txt` compatible with those artifacts.

Check service readiness at [localhost:8000/health](http://localhost:8000/health). Swagger UI (`/docs`) and ReDoc (`/redoc`) are currently disabled in `src/api/main.py`.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health and model readiness |
| GET | `/api/model/info` | Model metadata and locally available evaluation metrics |
| POST | `/api/analyze` | Analyze one message |
| POST | `/api/predict` | Alias for `/api/analyze` |
| POST | `/api/batch-predict` | Analyze up to 100 messages |

Single-message requests accept nonblank `text` up to 5,000 characters and a `type` of `email`, `sms`, or `auto` (default).

```json
{
  "text": "Please review the meeting agenda for tomorrow.",
  "type": "email"
}
```

Batch requests wrap these objects in a `messages` array. Responses include classification, risk score and level, binary model confidence and probabilities, rule-derived scam category, matched indicators, extracted URLs, and model/scoring versions.

### Scoring

- Score: model phishing probability multiplied by 100, rounded to one decimal place.
- Low risk / Legitimate: probability below 0.35.
- Medium risk / Suspicious: probability from 0.35 to below 0.70.
- High risk / Phishing: probability of at least 0.70.

Decisions use unrounded probabilities. Rules do not add score bonuses. Confidence describes the binary model, not a separately trained Suspicious class. Scores and indicator matches do not verify sender identity or live website reputation.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest ML/tests/ -v
```

## Data and model tools

Source datasets and generated reports are local files excluded from Git. Supply the dataset before running preprocessing, training, evaluation, or the scanner audit.

| Script under `ML/src/` | Purpose |
| --- | --- |
| `data/inspect_data.py` | Inspect the input dataset |
| `data/preprocess.py` | Clean, deduplicate, and split data |
| `training/compare_models.py` | Compare candidate classifiers |
| `training/train.py` | Train and replace model artifacts |
| `training/evaluate.py` | Evaluate binary classifier predictions |
| `training/audit_scanner.py` | Compare scoring policies, inspect label/template issues, and run synthetic language probes |

Run a script with the project interpreter, for example:

```powershell
.\.venv\Scripts\python.exe ML/src/training/audit_scanner.py
```

The audit writes to `ML/reports/scanner_audit/` and requires local `ML/data/processed/train.csv` and `test.csv`. It preserves model artifacts and original labels. Its synthetic Filipino/Taglish examples are development probes, not evidence of real-world language accuracy.

## Layout

- `models/`: trained classifier, vectorizer, and metadata.
- `src/api/`: FastAPI endpoints and request/response schemas.
- `src/inference/`: prediction and scoring logic.
- `src/features/`: text, URL, and indicator features.
- `src/data/` and `src/training/`: dataset and model tools.
- `tests/`: automated tests and synthetic fixtures.
- `data/` and `reports/`: local datasets and generated outputs.
