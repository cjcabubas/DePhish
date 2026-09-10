# DePhish — Machine Learning Subsystem & Serving API

The Machine Learning subsystem for **DePhish** detects phishing attacks across email and SMS messages using combined natural language processing (TF-IDF word & character n-grams) and explainable heuristic indicators (urgency, credential harvesting, financial baits, authority impersonation, and structural URL analysis).

---

## Directory Layout

```text
ML/
├── data/
│   ├── raw/                        # Original source datasets
│   └── processed/
│       ├── phishing_dataset.csv    # Merged input dataset (24,224 rows)
│       ├── dataset.csv             # Cleaned & deduplicated master dataset
│       ├── train.csv               # Stratified training set (80%)
│       └── test.csv                # Stratified testing set (20%)
├── models/
│   ├── phishing_model.pkl          # Serialized production classifier
│   ├── tfidf_vectorizer.pkl        # Fitted TF-IDF vectorizer
│   └── metadata.json               # Model version, metrics, hyperparameters
├── reports/
│   ├── metrics.json                # Accuracy, Precision, Recall, F1, ROC-AUC
│   ├── confusion_matrix.png        # Confusion matrix visual
│   └── misclassified.csv           # Test set error inspection
├── src/
│   ├── data/
│   │   ├── inspect_data.py         # Inspect dataset distribution & statistics
│   │   └── preprocess.py          # Data cleaning, deduplication, train/test split
│   ├── features/
│   │   ├── text_features.py        # TF-IDF vectorizer & feature pipeline
│   │   ├── url_features.py         # URL extraction & structural lexical analysis
│   │   └── indicator_features.py   # Heuristic phishing & social engineering indicators
│   ├── training/
│   │   ├── train.py                # Model training with calibrated probabilities
│   │   ├── evaluate.py             # Evaluation & report generator
│   │   └── compare_models.py       # Benchmark comparison across candidate models
│   ├── inference/
│   │   └── predict.py              # PhishingDetector class (0-100 risk score, explainable indicators)
│   └── api/
│       └── main.py                 # FastAPI server exposing prediction & analysis endpoints
├── tests/
│   ├── test_preprocess.py          # Preprocessing unit tests
│   ├── test_features.py            # Feature & indicator extraction unit tests
│   └── test_predict.py             # Inference & contract tests
├── requirements.txt
└── README.md
```

---

## Setup & Installation

From the project root:

```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install ML dependencies
pip install -r ML/requirements.txt
```

---

## Pipeline Execution

### 1. Inspect Dataset
```powershell
python ML/src/data/inspect_data.py
```

### 2. Preprocess & Split Data
Cleans whitespace, deduplicates entries, and performs stratified 80/20 train/test split:
```powershell
python ML/src/data/preprocess.py
```

### 3. Compare Models (Optional Benchmark)
Benchmarks Naive Bayes, Logistic Regression, Linear SVM, and Random Forest:
```powershell
python ML/src/training/compare_models.py
```

### 4. Train Model
Fits the production calibrated model and exports artifacts into `ML/models/`:
```powershell
python ML/src/training/train.py
```

### 5. Evaluate Model
Evaluates performance against `test.csv`, exports metrics to `ML/reports/metrics.json`, saves `confusion_matrix.png` and `misclassified.csv`:
```powershell
python ML/src/training/evaluate.py
```

### 6. Run Unit Tests
```powershell
pytest ML/tests/ -v
```

---

## Serving the API

Start the FastAPI server:

```powershell
uvicorn ML.src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive Swagger documentation is available at:
`http://localhost:8000/docs`

### API Endpoints

- `GET /health` — Service health and model status
- `GET /api/model/info` — Model metadata and test evaluation metrics
- `POST /api/analyze` — Single message analysis (returns risk score, level, confidence, and explainable indicators)
- `POST /api/predict` — Alias for `/api/analyze`
- `POST /api/batch-predict` — Batch message analysis

#### Sample Request (`POST /api/analyze`):
```json
{
  "text": "URGENT: Your account has been suspended! Verify your credentials here: http://192.168.1.1/login",
  "type": "email"
}
```

#### Sample Response:
```json
{
  "prediction": "Phishing",
  "risk_score": 98.4,
  "risk_level": "High Risk",
  "confidence": 0.984,
  "probabilities": {
    "legitimate": 0.016,
    "phishing": 0.984
  },
  "phishing_type": "Credential Harvesting",
  "detected_indicators": [
    {
      "category": "urgency_pressure",
      "title": "Urgency and Coercion",
      "description": "Uses urgent deadlines, fear, or panic tactics to force hasty compliance.",
      "severity": "high",
      "matched_terms": ["urgent", "account has been suspended"]
    },
    {
      "category": "credential_harvesting",
      "title": "Credential or Identity Solicitation",
      "description": "Prompts recipient to submit, verify, or reset sensitive credentials.",
      "severity": "high",
      "matched_terms": ["verify your credentials"]
    }
  ],
  "detected_urls": [
    {
      "url": "http://192.168.1.1/login",
      "hostname": "192.168.1.1",
      "is_ip": true,
      "has_at_symbol": false,
      "has_hyphen": false,
      "is_shortener": false,
      "is_suspicious_tld": false,
      "excessive_subdomains": false,
      "has_double_slash_path": false,
      "length": 25
    }
  ],
  "message_type": "email",
  "model_version": "1.0.0"
}
```
