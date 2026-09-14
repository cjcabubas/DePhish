"""Versioned sklearn-compatible feature pipeline for word/character models."""
import re
import unicodedata
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.preprocessing import MaxAbsScaler
from sklearn.svm import LinearSVC
from src.features.text_features import extract_dense_features


def normalize_v2(text):
    text = unicodedata.normalize('NFKC', str(text))[:10000].lower()
    text = text.replace('\u200b', '').replace('\u200c', '').replace('\u200d', '')
    text = re.sub(r'hxxps?://', lambda m: 'https://' if m.group().startswith('hxxps') else 'http://', text)
    text = text.replace('[.]', '.').replace('(dot)', '.')
    return re.sub(r'\s+', ' ', text).strip()


class DenseFeatures(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        return extract_dense_features([normalize_v2(t) for t in X])


def build_candidate():
    features = FeatureUnion([
        ('word', TfidfVectorizer(preprocessor=normalize_v2, ngram_range=(1,2), max_features=20000, min_df=2, sublinear_tf=True)),
        ('char', TfidfVectorizer(preprocessor=normalize_v2, analyzer='char_wb', ngram_range=(3,5), max_features=40000, min_df=2, sublinear_tf=True)),
        ('structured', Pipeline([('extract', DenseFeatures()), ('scale', MaxAbsScaler())])),
    ], transformer_weights={'word': 1.0, 'char': 1.0, 'structured': .25})
    return Pipeline([('features', features), ('classifier', LinearSVC(C=1.0, dual=False, random_state=42, max_iter=3000))])
