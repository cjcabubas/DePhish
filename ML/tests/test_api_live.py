"""
test_api_live.py - Direct API integration test using FastAPI TestClient.
Tests endpoints: /health, /api/model/info, /api/analyze, /api/batch-predict.
"""

import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.api.main import app

client = TestClient(app)


def test_api_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["model_loaded"] is True
    print("\n[PASS] /health response:", data)


def test_api_model_info_endpoint():
    resp = client.get("/api/model/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "metadata" in data
    assert "evaluation_metrics" in data
    print("[PASS] /api/model/info response: Accuracy =", data["evaluation_metrics"].get("accuracy"))


def test_api_analyze_phishing_message():
    phish_payload = {
        "text": "URGENT: Your PayPal account has been suspended! Immediate action required. Confirm your password now: http://192.168.1.1/login",
        "type": "email"
    }
    resp = client.post("/api/analyze", json=phish_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["prediction"] == "Phishing"
    assert data["risk_score"] >= 70.0
    assert data["risk_level"] == "High Risk"
    assert len(data["detected_indicators"]) > 0
    assert len(data["detected_urls"]) > 0
    print("[PASS] /api/analyze (Phishing) -> Risk Score:", data["risk_score"], "| Level:", data["risk_level"])


def test_api_analyze_safe_message():
    safe_payload = {
        "text": "Hey Mark, can you please review the attached meeting notes and let me know if you have any questions for our Monday sprint sync?",
        "type": "email"
    }
    resp = client.post("/api/analyze", json=safe_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["prediction"] == "Legitimate"
    assert data["risk_score"] < 35.0
    assert data["risk_level"] == "Low Risk"
    print("[PASS] /api/analyze (Safe) -> Risk Score:", data["risk_score"], "| Level:", data["risk_level"])


def test_api_batch_analyze():
    batch_payload = {
        "messages": [
            {"text": "Congratulations! You have won a $1,000 Walmart Gift Card. Click here to claim.", "type": "sms"},
            {"text": "See you at lunch at 12:30pm!", "type": "sms"}
        ]
    }
    resp = client.post("/api/batch-predict", json=batch_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_scanned"] == 2
    assert len(data["results"]) == 2
    print("[PASS] /api/batch-predict -> Scanned:", data["total_scanned"], "messages.")


if __name__ == "__main__":
    test_api_health_endpoint()
    test_api_model_info_endpoint()
    test_api_analyze_phishing_message()
    test_api_analyze_safe_message()
    test_api_batch_analyze()
    print("\nAll live API tests passed successfully!")


def test_invalid_inputs_rejected():
    for payload in [{"text": "   "}, {"text": "x" * 5001}, {"text": "hello", "type": "unknown"}]:
        assert client.post("/api/analyze", json=payload).status_code == 422


def test_score_matches_model_probability():
    data = client.post("/api/analyze", json={"text": "Urgent: confirm your password at https://example.com", "type": "email"}).json()
    assert abs(data["risk_score"] - data["probabilities"]["phishing"] * 100) <= .06
    assert data["scoring_version"] == "2.0.0"
