"""Opt-in retraining candidate; never changes the shipped v2 artifact's feature semantics."""
from sklearn.base import BaseEstimator, TransformerMixin
import numpy as np
from src.features.model_v2 import build_candidate, normalize_v2
from src.features.url_features import extract_url_feature_dict
from src.features.indicator_features import extract_indicator_features


class OriginalCaseDenseFeatures(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        # Formatting is measured on original input. Word/character branches still normalize.
        return np.array([list({**extract_url_feature_dict(normalize_v2(text)),
                              **extract_indicator_features(str(text))}.values()) for text in X], dtype=np.float32)


def build_original_case_candidate():
    pipeline = build_candidate()
    structured = dict(pipeline.named_steps['features'].transformer_list)['structured']
    structured.set_params(extract=OriginalCaseDenseFeatures())
    return pipeline
