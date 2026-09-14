# DePhish ML service

FastAPI message classifier using calibrated Linear SVM pipelines with word/character TF-IDF and structured features. The v2 artifact is included in `models/`.

## Run

From the repository root, after creating `.venv`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r ML/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn ML.src.api.main:app --host 127.0.0.1 --port 8000
```

Keep the pinned scikit-learn version for artifact compatibility. Restart after changing model artifacts. See the [root guide](../README.md) for Express and frontend setup.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Model readiness |
| GET | `/api/model/info` | Active model metadata |
| POST | `/api/analyze` | Classify one message |
| POST | `/api/predict` | Alias for analyze |
| POST | `/api/batch-predict` | Classify up to 100 messages |

Single requests accept `text` (1–5,000 characters) and `type` (`email`, `sms`, or `auto`). Batch requests use a `messages` array. Swagger and ReDoc are disabled.

This service returns the message-model score, probabilities, pattern indicators, and extracted URLs. Express adds live link evidence through `/api/scans/analyze`, which is the frontend's scan endpoint.

The model score is phishing probability × 100. Cutoffs are 35 for Suspicious and 70 for Phishing, evaluated using unrounded probability. Confidence refers to the binary classifier; Suspicious is a threshold range, not a trained third class.

## Evaluation and training

V2 improved existing test-set binary F1 from 96.76% to 98.15%. This is not an independent field benchmark. Filipino/Taglish detection remains unvalidated and regressed on several development probes.

See [model comparison, rollback, and link scoring](MODEL_UPGRADE.md) for details. Local datasets and generated reports are excluded from Git.

- `src/training/upgrade_model.py`: generate a v2 candidate and comparison without replacing the active artifact.
- `src/training/evaluate.py`: evaluate the active model.
- `src/training/audit_scanner.py`: preserve the legacy v1 scoring audit.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest ML/tests -q
```
