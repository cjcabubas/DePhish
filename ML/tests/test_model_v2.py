import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from src.inference.predict import PhishingDetector
from src.features.model_v2 import normalize_v2


def test_versioned_model_and_rollback_load():
    active=PhishingDetector()
    legacy=PhishingDetector(use_legacy=True)
    assert active.metadata['version']=='2.0.0'
    assert legacy.metadata['version']=='1.0.0'
    texts=['Team meeting tomorrow at noon.', 'Urgent: confirm your password at https://example.com']
    for detector in (active,legacy):
        probabilities=detector.predict_probabilities(texts)
        assert probabilities.shape==(2,2)
        assert np.allclose(probabilities.sum(axis=1),1)
        assert np.all((probabilities>=0)&(probabilities<=1))
    assert active.analyze(texts[0])['model_limitations']


def test_v2_normalization_handles_obfuscation_consistently():
    assert normalize_v2('HXXPS://Example[.]com')=='https://example.com'
    assert normalize_v2('pass\u200bword')=='password'
    assert normalize_v2('ＰＡＳＳＷＯＲＤ')=='password'
