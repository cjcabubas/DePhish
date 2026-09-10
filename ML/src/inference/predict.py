"""
predict.py - Core inference engine for DePhish.
Provides PhishingDetector class for single and batch predictions,
risk scoring (0-100), risk levels, confidence, and explainable indicator reporting.
"""

import os
import sys
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

import joblib
import numpy as np

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.features.text_features import CombinedFeaturePipeline
from src.features.url_features import extract_urls, analyze_url
from src.features.indicator_features import extract_indicators, classify_phishing_type


class PhishingDetector:
    """
    Production detector combining trained scikit-learn model with
    heuristic and lexical indicator explanations.
    """

    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = models_dir or (BASE_DIR / "models")
        self.model_path = self.models_dir / "phishing_model.pkl"
        self.vec_path = self.models_dir / "tfidf_vectorizer.pkl"
        self.meta_path = self.models_dir / "metadata.json"

        self.model = None
        self.vectorizer = None
        self.pipeline = None
        self.metadata = {}

        self._load_artifacts()

    def _load_artifacts(self):
        if not self.model_path.exists() or not self.vec_path.exists():
            raise FileNotFoundError(
                f"Model artifacts not found in {self.models_dir}. "
                "Please run 'python ML/src/training/train.py' first."
            )

        self.model = joblib.load(self.model_path)
        self.vectorizer = joblib.load(self.vec_path)
        self.pipeline = CombinedFeaturePipeline(vectorizer=self.vectorizer)

        if self.meta_path.exists():
            with self.meta_path.open("r", encoding="utf-8") as f:
                self.metadata = json.load(f)

    def analyze(self, text: str, message_type: str = "auto") -> Dict[str, Any]:
        """
        Analyzes a single email or SMS message.

        Returns:
            Dict containing:
            - prediction: 'Legitimate', 'Suspicious', or 'Phishing'
            - risk_score: 0.0 - 100.0
            - risk_level: 'Low Risk', 'Medium Risk', 'High Risk'
            - confidence: float 0.0 - 1.0
            - probabilities: {'legitimate': float, 'phishing': float}
            - phishing_type: str (dominant scam category)
            - detected_indicators: list of matched indicator details
            - detected_urls: list of analyzed URL objects
            - message_type: 'email', 'sms', or detected
        """
        if not text or not text.strip():
            return {
                "prediction": "Legitimate",
                "risk_score": 0.0,
                "risk_level": "Low Risk",
                "confidence": 1.0,
                "probabilities": {"legitimate": 1.0, "phishing": 0.0},
                "phishing_type": "None",
                "detected_indicators": [],
                "detected_urls": [],
                "message_type": message_type,
            }

        # 1. Feature extraction & model prediction
        X = self.pipeline.transform([text])
        phishing_prob = float(self.model.predict_proba(X)[0, 1])
        legit_prob = float(1.0 - phishing_prob)

        # 2. Heuristics & Explainability
        indicators = extract_indicators(text)
        raw_urls = extract_urls(text)
        analyzed_urls = [analyze_url(u) for u in raw_urls]

        # Calculate high severity indicators count
        high_sev = sum(1 for i in indicators if i.get("severity") == "high")
        has_suspicious_url = any(
            u["is_ip"] or u["has_at_symbol"] or u["is_suspicious_tld"] or u["is_shortener"]
            for u in analyzed_urls
        )

        # 3. Calculate calibrated Risk Score (0-100)
        base_score = phishing_prob * 100.0

        # Adjust score slightly if hard heuristic violations exist
        boost = 0.0
        if high_sev > 0:
            boost += min(15.0, high_sev * 5.0)
        if has_suspicious_url:
            boost += 10.0

        risk_score = round(float(np.clip(base_score + boost, 0.0, 100.0)), 1)

        # 4. Determine Classification & Risk Level
        if risk_score >= 70.0:
            risk_level = "High Risk"
            prediction = "Phishing"
            confidence = round(max(phishing_prob, 0.70), 4)
        elif risk_score >= 35.0:
            risk_level = "Medium Risk"
            prediction = "Suspicious"
            confidence = round(phishing_prob if phishing_prob > 0.5 else legit_prob, 4)
        else:
            risk_level = "Low Risk"
            prediction = "Legitimate"
            confidence = round(legit_prob, 4)

        # 5. Phishing type categorization
        phishing_type = classify_phishing_type(indicators, has_url=bool(analyzed_urls))

        # 6. Auto-detect message type if requested
        detected_type = message_type
        if message_type == "auto":
            detected_type = "sms" if len(text) <= 160 and ("\n" not in text) else "email"

        return {
            "prediction": prediction,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "confidence": confidence,
            "probabilities": {
                "legitimate": round(legit_prob, 4),
                "phishing": round(phishing_prob, 4),
            },
            "phishing_type": phishing_type,
            "detected_indicators": indicators,
            "detected_urls": analyzed_urls,
            "message_type": detected_type,
            "model_version": self.metadata.get("version", "1.0.0"),
        }

    def batch_analyze(self, texts: List[str], message_type: str = "auto") -> List[Dict[str, Any]]:
        """Analyzes a batch of texts efficiently."""
        return [self.analyze(t, message_type=message_type) for t in texts]


if __name__ == "__main__":
    detector = PhishingDetector()
    sample = (
        "URGENT: Your PayPal account has been suspended due to suspicious activity. "
        "Click here immediately to verify your identity: http://192.168.1.1/login or your account will be deleted!"
    )
    res = detector.analyze(sample)
    print(json.dumps(res, indent=2))
