"""
main.py - FastAPI service for DePhish Machine Learning Inference.
Provides endpoints for health check, model metadata, single and batch message analysis.
"""

import sys
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure ML package is on sys.path
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.inference.predict import PhishingDetector

from contextlib import asynccontextmanager

# Global detector instance
detector: Optional[PhishingDetector] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector
    try:
        detector = PhishingDetector()
        print("DePhish detector model initialized successfully.")
    except Exception as exc:
        print(f"Warning: Model could not be initialized on startup ({exc}).")
        detector = None
    yield


app = FastAPI(
    title="DePhish ML Inference API",
    description="Backend ML service for phishing message scanning, risk scoring, and explainable indicator analysis.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

# Enable CORS for React client / Express server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_detector() -> PhishingDetector:
    global detector
    if detector is None:
        try:
            detector = PhishingDetector()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Model artifacts not loaded. Please train the model first. Error: {str(exc)}",
            )
    return detector


# Pydantic Schemas
class AnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Raw message or email text to scan")
    type: Optional[str] = Field("auto", description="Type of message: 'email', 'sms', or 'auto'")


class IndicatorItem(BaseModel):
    category: str
    title: str
    description: str
    severity: str
    matched_terms: List[str]


class UrlAnalysisItem(BaseModel):
    url: str
    hostname: str
    is_ip: bool
    has_at_symbol: bool
    has_hyphen: bool
    is_shortener: bool
    is_suspicious_tld: bool
    excessive_subdomains: bool
    has_double_slash_path: bool
    length: int


class AnalyzeResponse(BaseModel):
    prediction: str = Field(..., description="Legitimate, Suspicious, or Phishing")
    risk_score: float = Field(..., description="Risk score from 0.0 (safe) to 100.0 (critical)")
    risk_level: str = Field(..., description="Low Risk, Medium Risk, or High Risk")
    confidence: float = Field(..., description="Confidence score between 0.0 and 1.0")
    probabilities: Dict[str, float]
    phishing_type: str = Field(..., description="Dominant phishing / scam category")
    detected_indicators: List[IndicatorItem]
    detected_urls: List[UrlAnalysisItem]
    message_type: str
    model_version: str


class BatchAnalyzeRequest(BaseModel):
    messages: List[AnalyzeRequest] = Field(..., min_length=1, description="List of messages to scan")


class BatchAnalyzeResponse(BaseModel):
    results: List[AnalyzeResponse]
    total_scanned: int


# API Endpoints
@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint confirming service status and model readiness."""
    global detector
    if detector is None:
        try:
            detector = PhishingDetector()
        except Exception:
            pass
    is_ready = detector is not None
    return {
        "status": "healthy" if is_ready else "degraded",
        "model_loaded": is_ready,
        "service": "DePhish-ML-Backend",
        "version": "1.0.0",
    }


@app.get("/api/model/info", tags=["Model"])
def model_info():
    """Returns model metadata, hyperparameter configuration, and test metrics if available."""
    det = get_detector()
    reports_file = BASE_DIR / "reports" / "metrics.json"
    metrics = {}
    if reports_file.exists():
        with reports_file.open("r", encoding="utf-8") as f:
            metrics = json.load(f)

    return {
        "metadata": det.metadata,
        "evaluation_metrics": metrics,
    }


@app.post("/api/analyze", response_model=AnalyzeResponse, tags=["Inference"])
def analyze_message(req: AnalyzeRequest):
    """Scans and analyzes a single email or SMS message."""
    det = get_detector()
    result = det.analyze(req.text, message_type=req.type)
    return result


@app.post("/api/predict", response_model=AnalyzeResponse, tags=["Inference"])
def predict_message(req: AnalyzeRequest):
    """Alias for /api/analyze."""
    return analyze_message(req)


@app.post("/api/batch-predict", response_model=BatchAnalyzeResponse, tags=["Inference"])
def batch_analyze(req: BatchAnalyzeRequest):
    """Batch scans multiple messages in a single request."""
    det = get_detector()
    results = [det.analyze(item.text, message_type=item.type) for item in req.messages]
    return {
        "results": results,
        "total_scanned": len(results),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
