"""
test_features.py - Tests URL extraction, indicator heuristic detection, and text feature pipelines.
"""

import pytest
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.features.url_features import extract_urls, analyze_url, extract_url_feature_dict
from src.features.indicator_features import extract_indicators, classify_phishing_type, extract_indicator_features
from src.features.text_features import normalize_text, CombinedFeaturePipeline


def test_url_extraction():
    text = "Please verify your account at https://secure-bank.example.com/login immediately or visit 192.168.1.1/reset"
    urls = extract_urls(text)
    assert len(urls) >= 1
    assert any("secure-bank.example.com" in u for u in urls)


def test_url_analysis_ip():
    res = analyze_url("http://192.168.1.1/login")
    assert res["is_ip"] is True


def test_url_analysis_at_symbol():
    res = analyze_url("http://google.com@attacker-site.com/steal")
    assert res["has_at_symbol"] is True


def test_indicator_urgency_detection():
    sample = "URGENT: Your account will be suspended within 24 hours unless you act now!"
    indicators = extract_indicators(sample)
    cats = [ind["category"] for ind in indicators]
    assert "urgency_pressure" in cats


def test_indicator_credential_detection():
    sample = "Please verify your password and confirm your identity to keep your account safe."
    indicators = extract_indicators(sample)
    cats = [ind["category"] for ind in indicators]
    assert "credential_harvesting" in cats


def test_indicator_financial_bait():
    sample = "Congratulations! You have won a free $1,000 gift card lottery prize! Claim reward now."
    indicators = extract_indicators(sample)
    cats = [ind["category"] for ind in indicators]
    assert "financial_bait" in cats


def test_classify_phishing_type():
    sample = "Immediate action required: verify your login credentials at our bank security portal"
    indicators = extract_indicators(sample)
    ptype = classify_phishing_type(indicators)
    assert ptype == "Credential Harvesting"


def test_combined_feature_pipeline():
    texts = [
        "Normal meeting notes for tomorrow at 10am.",
        "URGENT: Verify your bank account credentials immediately at http://192.168.1.1/login",
    ]
    pipeline = CombinedFeaturePipeline()
    X = pipeline.fit_transform(texts)
    assert X.shape[0] == 2
    assert X.shape[1] > 10
