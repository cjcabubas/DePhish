import sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.inference.indicators import analyze_indicators
from src.inference.predict import PhishingDetector
from src.features.model_v2 import DenseFeatures
from src.features.model_v3 import OriginalCaseDenseFeatures
from src.features.text_features import get_dense_feature_names
from src.api.main import app
from fastapi.testclient import TestClient


def test_original_case_observations_and_versioned_feature_fix():
    message = 'URGENT YOUR ACCOUNT WILL BE SUSPENDED. SHARE YOUR OTP!!!'
    result = analyze_indicators(message)
    assert result['formatting']['uppercaseRatio'] == 1
    assert any(row['category'] == 'secret_disclosure' for row in result['indicators'])
    assert 'risk_score' not in result
    assert not any(row['category'] == 'secret_disclosure' for row in analyze_indicators('Never share your OTP.')['indicators'])
    index = get_dense_feature_names().index('ind_upper_ratio')
    assert DenseFeatures().transform([message])[0, index] == 0
    assert OriginalCaseDenseFeatures().transform([message])[0, index] == 1
    normalized = analyze_indicators('Share your pa\u200bssword', normalized_text='Share your password')
    secret = next(row for row in normalized['indicators'] if row['category'] == 'secret_disclosure')
    assert secret['source'] == 'normalized_pattern'
    assert secret['evidence'] == []


def test_classifier_contract_preserves_loaded_model_probability():
    model = PhishingDetector()
    for text in ['Meeting tomorrow at noon.', 'URGENT: share your OTP to verify your account.']:
        classified = model.classify(text)
        assert np.isclose(classified['probabilities']['phishing'], model.predict_probabilities([text])[0, 1])
        assert 'detected_indicators' not in classified
        assert 'detected_urls' not in classified


def test_independent_api_endpoints():
    client = TestClient(app)
    response = client.post('/api/indicators', json={'text': 'Share your OTP', 'has_url': True})
    assert response.status_code == 200
    assert response.json()['indicators'][0]['category'] == 'secret_disclosure'
    response = client.post('/api/classify', json={'text': 'Meeting tomorrow.'})
    assert response.status_code == 200
    assert 0 <= response.json()['probabilities']['phishing'] <= 1
    assert client.post('/api/classify', json={'text': ' '}).status_code == 422
