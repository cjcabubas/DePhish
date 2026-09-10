"""
test_predict.py - Tests detector inference logic, risk scores, levels, and API contract.
"""

import pytest
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.inference.predict import PhishingDetector


@pytest.fixture(scope="module")
def detector():
    # Only runs if model is trained
    models_dir = BASE_DIR / "models"
    if (models_dir / "phishing_model.pkl").exists():
        return PhishingDetector(models_dir=models_dir)
    pytest.skip("Model artifacts not yet generated. Run training first.")


def test_empty_message_is_safe(detector):
    res = detector.analyze("")
    assert res["prediction"] == "Legitimate"
    assert res["risk_score"] == 0.0
    assert res["risk_level"] == "Low Risk"


def test_phishing_message_detected(detector):
    phish_text = (
        "URGENT: Your account has been suspended! "
        "Click here immediately to confirm your password: http://192.168.1.1/login"
    )
    res = detector.analyze(phish_text)
    assert res["prediction"] in ("Phishing", "Suspicious")
    assert res["risk_score"] >= 35.0
    assert len(res["detected_indicators"]) > 0
    assert 0.0 <= res["confidence"] <= 1.0


def test_legitimate_message_detected(detector):
    safe_text = "Hi team, let's schedule our project review meeting for tomorrow at 2pm in conference room B. Thanks!"
    res = detector.analyze(safe_text)
    assert res["risk_level"] in ("Low Risk", "Medium Risk")
    assert 0.0 <= res["confidence"] <= 1.0
