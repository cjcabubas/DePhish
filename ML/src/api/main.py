"""
main.py - FastAPI service for DePhish Machine Learning Inference.
Provides endpoints for health check, model metadata, single and batch message analysis.
"""

import sys
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Literal

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# Ensure ML package is on sys.path
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env")

from src.inference.predict import PhishingDetector

from contextlib import asynccontextmanager

# Global detector and database instances
detector: Optional[PhishingDetector] = None
mongo_client: Optional[AsyncIOMotorClient] = None
scans_collection = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, mongo_client, scans_collection
    try:
        detector = PhishingDetector()
        print("DePhish detector model initialized successfully.")
    except Exception as exc:
        print(f"Warning: Model could not be initialized on startup ({exc}).")
        detector = None

    # Connect to MongoDB Atlas if URI is configured
    mongodb_uri = os.getenv("MONGODB_URI")
    if mongodb_uri:
        try:
            mongo_client = AsyncIOMotorClient(mongodb_uri, serverSelectionTimeoutMS=5000)
            db_name = os.getenv("DB_NAME", "dephish_db")
            db = mongo_client[db_name]
            coll_name = os.getenv("COLLECTION_NAME", "scan_reports")
            scans_collection = db[coll_name]
            await mongo_client.admin.command("ping")
            print(f"Connected to MongoDB Atlas successfully: '{db_name}.{coll_name}'")
        except Exception as exc:
            print(f"Warning: Could not connect to MongoDB Atlas ({exc}).")
            mongo_client = None
            scans_collection = None

    yield

    if mongo_client is not None:
        mongo_client.close()


app = FastAPI(
    title="DePhish ML Inference API",
    description="Backend ML service for phishing message scanning, risk scoring, and explainable indicator analysis.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
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
    text: str = Field(..., min_length=1, max_length=5000, description="Raw message or email text to scan")
    type: Literal["email", "sms", "auto"] = Field("auto", description="Type of message: 'email', 'sms', or 'auto'")


    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Message must contain non-whitespace text.")
        return value


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
    scoring_version: str


class BatchAnalyzeRequest(BaseModel):
    messages: List[AnalyzeRequest] = Field(..., min_length=1, max_length=100, description="List of messages to scan")


class BatchAnalyzeResponse(BaseModel):
    results: List[AnalyzeResponse]
    total_scanned: int


# API Endpoints
@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint confirming service status, model readiness, and MongoDB Atlas connection."""
    global detector, scans_collection
    if detector is None:
        try:
            detector = PhishingDetector()
        except Exception:
            pass
    is_ready = detector is not None
    return {
        "status": "healthy" if is_ready else "degraded",
        "model_loaded": is_ready,
        "mongodb_connected": scans_collection is not None,
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
async def analyze_message(req: AnalyzeRequest):
    """Scans and analyzes a single email or SMS message, persisting results in MongoDB Atlas."""
    det = get_detector()
    result = det.analyze(req.text, message_type=req.type)

    if scans_collection is not None:
        try:
            scan_doc = {
                "submitted_text": req.text,
                "message_type": req.type,
                "prediction": result.get("prediction"),
                "risk_score": result.get("risk_score"),
                "risk_level": result.get("risk_level"),
                "confidence": result.get("confidence"),
                "probabilities": result.get("probabilities"),
                "phishing_type": result.get("phishing_type"),
                "detected_indicators": result.get("detected_indicators"),
                "detected_urls": result.get("detected_urls"),
                "model_version": result.get("model_version"),
                "scoring_version": result.get("scoring_version"),
                "status": "Pending Review",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await scans_collection.insert_one(scan_doc)
            print(f"[MongoDB Atlas] Scan saved: {result.get('prediction')} ({result.get('risk_score')}%)")
        except Exception as exc:
            print(f"Warning: Could not save scan to MongoDB Atlas ({exc})")

    return result


@app.post("/api/predict", response_model=AnalyzeResponse, tags=["Inference"])
async def predict_message(req: AnalyzeRequest):
    """Alias for /api/analyze."""
    return await analyze_message(req)


@app.get("/api/scans", tags=["Inference"])
async def get_scans(limit: int = 50):
    """Retrieves recent scan records stored in MongoDB Atlas."""
    if scans_collection is None:
        return {"scans": [], "mongodb_connected": False}
    try:
        cursor = scans_collection.find().sort("timestamp", -1).limit(limit)
        scans = []
        async for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            scans.append(doc)
        return {"scans": scans, "total": len(scans), "mongodb_connected": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to query MongoDB: {exc}")


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
