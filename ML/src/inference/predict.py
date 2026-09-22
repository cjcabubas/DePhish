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
from src.features.indicator_features import extract_indicators, classify_phishing_type, INDICATOR_PATTERNS
from src.inference.evidence import detailed_indicators
from src.inference.explanation import explain_model


def score_prediction(phishing_prob: float) -> Dict[str, Any]:
    """Model estimate, not a guarantee. Thresholds retained, not tuned on test data."""
    if not 0 <= phishing_prob <= 1:
        raise ValueError("Probability must be between zero and one.")
    prediction, level = ("Phishing", "High Risk") if phishing_prob >= .70 else (
        ("Suspicious", "Medium Risk") if phishing_prob >= .35 else ("Legitimate", "Low Risk"))
    return {"prediction": prediction, "risk_level": level,
            "risk_score": round(phishing_prob * 100, 1),
            # Confidence is binary model confidence, not a third-class probability.
            "confidence": round(max(phishing_prob, 1 - phishing_prob), 4)}


class PhishingDetector:
    """
    Production detector combining trained scikit-learn model with
    heuristic and lexical indicator explanations.
    """

    def __init__(self, models_dir: Optional[Path] = None, use_legacy: bool = False):
        self.use_legacy = use_legacy
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
        metadata_path = self.models_dir / "metadata-v1.json" if self.use_legacy and (self.models_dir / "metadata-v1.json").exists() else self.meta_path
        if metadata_path.exists():
            self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        artifact = self.metadata.get("pipeline_file") if not self.use_legacy else None
        if artifact:
            self.model_path = self.models_dir / artifact
            self.model = joblib.load(self.model_path)
            self.pipeline = None  # Serialized estimator owns all feature transforms.
            return
        if not self.model_path.exists() or not self.vec_path.exists():
            raise FileNotFoundError(f"Model artifacts not found in {self.models_dir}.")
        self.model = joblib.load(self.model_path)
        self.vectorizer = joblib.load(self.vec_path)
        self.pipeline = CombinedFeaturePipeline(vectorizer=self.vectorizer)

    def predict_probabilities(self, texts):
        inputs = self.pipeline.transform(texts) if self.pipeline is not None else texts
        return self.model.predict_proba(inputs)

    def classify(self, original_text):
        """Model-only contract. The serialized estimator owns its frozen normalization."""
        if not original_text or not original_text.strip():
            raise ValueError('Message must contain non-whitespace text.')
        probability = float(self.predict_probabilities([original_text])[0, 1])
        return {**score_prediction(probability),
                'probabilities': {'phishing': probability, 'legitimate': 1 - probability},
                'model_version': self.metadata.get('version', '1.0.0'),
                'model_limitations': self.metadata.get('limitations', []),
                'model_explanation': explain_model(self.model, original_text, probability)}

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
            raise ValueError("Message must contain non-whitespace text.")

        # 1. Feature extraction & model prediction
        phishing_prob = float(self.predict_probabilities([text])[0, 1])
        legit_prob = float(1.0 - phishing_prob)

        # 2. Heuristics & Explainability
        indicators = detailed_indicators(text, extract_indicators(text), INDICATOR_PATTERNS)
        raw_urls = extract_urls(text)
        analyzed_urls = [analyze_url(u) for u in raw_urls]

        # Rules explain observed patterns; they do not inflate model probability.
        decision = score_prediction(phishing_prob)

        # 5. Phishing type categorization
        phishing_type = classify_phishing_type(indicators, has_url=bool(analyzed_urls))
        specific_types = {'secret_disclosure': 'Security Secret Solicitation',
                          'payment_redirection': 'Payment Redirection',
                          'remote_access': 'Remote Access Solicitation',
                          'security_bypass': 'Security Bypass Request'}
        phishing_type = next((specific_types[i['category']] for i in indicators
                              if i['category'] in specific_types), phishing_type)

        # 6. Auto-detect message type if requested
        detected_type = message_type
        if message_type == "auto":
            detected_type = "sms" if len(text) <= 160 and ("\n" not in text) else "email"

        return {
            **decision,
            "probabilities": {
                "legitimate": round(legit_prob, 4),
                "phishing": round(phishing_prob, 4),
            },
            "phishing_type": phishing_type if decision["prediction"] != "Legitimate" else "Not established",
            "detected_indicators": indicators,
            "detected_urls": analyzed_urls,
            "message_type": detected_type,
            "model_version": self.metadata.get("version", "1.0.0"),
            "scoring_version": "2.0.0",
            "model_limitations": self.metadata.get("limitations", []),
            "model_explanation": explain_model(self.model, text, phishing_prob),
            "analysis_version": "1.0.0-detailed-evidence",
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
