import sys
from pathlib import Path
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.features.indicator_features import extract_indicators, INDICATOR_PATTERNS
from src.inference.evidence import detailed_indicators
from src.inference.predict import PhishingDetector


def observe(text):
    return detailed_indicators(text, extract_indicators(text), INDICATOR_PATTERNS)


@pytest.mark.parametrize('text,category', [
    ('Please share your OTP with our agent.', 'secret_disclosure'),
    ('Ibigay mo ang OTP para ma-verify.', 'secret_disclosure'),
    ('Use our new bank account details to pay the invoice.', 'payment_redirection'),
    ('Install AnyDesk so we can fix your account.', 'remote_access'),
    ('Enable macros to view this invoice.', 'security_bypass'),
    ('Do not contact your bank about this payment.', 'security_bypass'),
])
def test_specific_request_evidence_is_verbatim(text, category):
    indicator = next(i for i in observe(text) if i['category'] == category)
    assert indicator['why_it_matters'] and indicator['benign_context'] and indicator['recommended_action']
    for evidence in indicator['evidence']:
        assert text[evidence['start']:evidence['end']] == evidence['text']
        assert evidence['text'] in evidence['context']


@pytest.mark.parametrize('text', ['Never share your OTP.', "Don't send your password.", 'Do not install AnyDesk.', 'Huwag ibigay ang OTP.'])
def test_direct_safety_warnings_are_not_new_solicitation_findings(text):
    assert not any(i['category'] in ('secret_disclosure', 'remote_access') for i in observe(text))


def test_brand_claim_is_not_presented_as_verified_impersonation():
    indicator = next(i for i in observe('Microsoft security: your account needs review.') if i['category'] == 'impersonation')
    assert indicator['title'] == 'Claimed brand or authority'
    assert 'not verified' in indicator['benign_context']


@pytest.fixture(scope='module')
def detector():
    return PhishingDetector()


@pytest.mark.parametrize('text', [
    'URGENT: Please share your OTP and password with our agent now.',
    'Team meeting tomorrow. Please bring the project notes.',
    'HXXPS://Example[.]com — pass\u200bword reset',
])
def test_model_attribution_reconstructs_margin_and_preserves_score(detector, text):
    probabilities = detector.predict_probabilities([text])[0]
    result = detector.analyze(text)
    explanation = result['model_explanation']
    assert result['risk_score'] == round(float(probabilities[1]) * 100, 1)
    assert explanation['available']
    folds = detector.model.calibrated_classifiers_
    expected = np.mean([fold.estimator.decision_function([text])[0] for fold in folds])
    assert explanation['mean_margin'] == pytest.approx(expected, abs=1e-6)
    assert explanation['bias'] + sum(g['contribution'] for g in explanation['feature_groups']) == pytest.approx(expected, abs=3e-6)
    fold_probs = [fold.predict_proba([text])[0, 1] for fold in folds]
    assert explanation['fold_probability_range']['min'] == round(min(fold_probs), 4)
    assert explanation['fold_probability_range']['max'] == round(max(fold_probs), 4)
    assert all(i['contribution'] > 0 for i in explanation['toward_phishing'])
    assert all(i['contribution'] < 0 for i in explanation['toward_legitimate'])


def test_legacy_model_has_explicit_explanation_fallback():
    result = PhishingDetector(use_legacy=True).analyze('Team meeting tomorrow.')
    assert result['model_explanation']['available'] is False
