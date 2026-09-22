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
| POST | `/api/classify` | Model-only probability, version, and learned contributions |
| POST | `/api/indicators` | Independent original-text observations; no model required |
| POST | `/api/analyze` | Legacy combined message analysis |
| POST | `/api/predict` | Alias for analyze |
| POST | `/api/batch-predict` | Classify up to 100 messages |

Single requests accept `text` (1–5,000 characters) and `type` (`email`, `sms`, or `auto`). Batch requests use a `messages` array. Swagger and ReDoc are disabled.

Express uses `/api/classify` and `/api/indicators` independently and performs canonical artifact extraction and URL inspection itself. `/api/indicators` accepts a `has_url` boolean from that extractor. The legacy `/api/analyze` and batch endpoints retain their old combined response for compatibility. Keep the ML service private; the frontend uses the consent-gated `/api/scans/analyze` route.

### Detailed evidence

Each indicator includes verbatim passages and their character offsets, why the pattern matters, legitimate-context caveats, and a specific verification step. Additional explanation rules cover security-secret disclosure, payment redirection, remote access, security bypass, and unusual text encoding. Direct warnings such as “never share your OTP” are excluded from the new solicitation rules. Rules still have limited context understanding; quoted instructions may match.

`model_explanation` reports exact additive contributions to the v2 ensemble’s mean pre-calibration SVM margin, grouped into words, character patterns, and structured features. The strongest informative observed word features are shown in each direction; common function words remain in group totals but are omitted from phrase lists. Their values are margin units, not changes in probability or combined risk points. Calibration-fold probability ranges describe variation between trained models, not confidence intervals. Estimates within five percentage points of a decision boundary are marked as near-threshold. The legacy model returns an explicit unavailable explanation.

This update improves evidence coverage and model transparency, without retraining or altering the frozen feature extraction used by the existing artifact. It does not establish an accuracy improvement or Filipino/Taglish support. New detailed results are persisted with signed-in scans; earlier history entries retain their original results.

The model score is phishing probability × 100. Cutoffs are 35 for Suspicious and 70 for Phishing, evaluated using unrounded probability. Confidence refers to the binary classifier; Suspicious is a threshold range, not a trained third class.

## Evaluation and training

V2 improved existing test-set binary F1 from 96.76% to 98.15%. This is not an independent field benchmark. Filipino/Taglish detection remains unvalidated and regressed on several development probes.

See [model comparison, rollback, and link scoring](MODEL_UPGRADE.md) for details. Local datasets and generated reports are excluded from Git.

- `src/training/upgrade_model_v3.py`: trains a versioned original-case structured-feature candidate; `--promote` switches metadata only when fixed evaluation checks pass. The v2 transformer is never modified. Evaluation reuses the existing test set and is not a fresh field benchmark.
- `src/training/upgrade_model.py`: generate a v2 candidate and comparison without replacing the active artifact.
- `src/training/evaluate.py`: evaluate the active model.
- `src/training/audit_scanner.py`: preserve the legacy v1 scoring audit.

## Tests

Direct `/api/` access is limited to 120 requests per minute per connecting IP, with HTTP 429 and Retry-After responses. Batch requests count as one request and remain capped at 100 messages. Health checks are exempt. Counters are bounded and kept per process; when Express forwards scans, those requests share its connecting IP. Keep this service private in deployment and use shared limits if scaling to multiple workers.

```powershell
.\.venv\Scripts\python.exe -m pytest ML/tests -q
```

### Original-case candidate result

The 2026-09-20 v3 candidate retained binary F1 at 0.981475, reduced missed high-risk cases from 61 to 58, and increased warning-level false positives from 32 to 34. It failed the fixed promotion gate, so model v2.0.0 remains active. Independent indicator analysis now reports original-case formatting correctly. The shipped v2 structured uppercase feature remains frozen until a validated replacement is promoted. The full local comparison is in `reports/model_upgrade_v3/comparison.json`.
