"""
text_features.py - Text feature extraction and combined feature assembly for DePhish.
"""

import re
from typing import List, Dict, Any, Union
import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer

from .url_features import extract_url_feature_dict
from .indicator_features import extract_indicator_features


def normalize_text(text: str) -> str:
    """Preprocesses text for NLP / TF-IDF extraction."""
    if not isinstance(text, str):
        return ""
    # Lowercase
    text = text.lower()
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_vectorizer(max_features: int = 15000, min_df: int = 2) -> TfidfVectorizer:
    """Creates a configured TF-IDF vectorizer suited for email and SMS text."""
    return TfidfVectorizer(
        preprocessor=normalize_text,
        ngram_range=(1, 2),
        max_features=max_features,
        min_df=min_df,
        sublinear_tf=True,
        strip_accents="unicode",
        token_pattern=r"(?u)\b\w[\w-]*\w\b|\b\w\b",
    )


def extract_dense_features(texts: List[str]) -> np.ndarray:
    """
    Extracts numerical features (URL metrics + heuristic indicators) for a list of texts.
    Returns a 2D numpy array with shape (len(texts), num_features).
    """
    feature_rows = []
    for text in texts:
        url_feats = extract_url_feature_dict(text)
        ind_feats = extract_indicator_features(text)
        combined = {**url_feats, **ind_feats}
        feature_rows.append(list(combined.values()))

    return np.array(feature_rows, dtype=np.float32)


def get_dense_feature_names() -> List[str]:
    """Returns the names of all dense numerical features in order."""
    sample = "sample"
    url_feats = extract_url_feature_dict(sample)
    ind_feats = extract_indicator_features(sample)
    return list({**url_feats, **ind_feats}.keys())


class CombinedFeaturePipeline:
    """
    Combines TF-IDF sparse matrix with structured lexical and heuristic features.
    """

    def __init__(self, vectorizer: TfidfVectorizer = None):
        self.vectorizer = vectorizer or build_vectorizer()
        self.dense_feature_names = get_dense_feature_names()

    def fit(self, texts: List[str]):
        self.vectorizer.fit(texts)
        return self

    def transform(self, texts: List[str]) -> sparse.csr_matrix:
        tfidf_mat = self.vectorizer.transform(texts)
        dense_mat = extract_dense_features(texts)
        dense_sparse = sparse.csr_matrix(dense_mat)
        return sparse.hstack([tfidf_mat, dense_sparse], format="csr")

    def fit_transform(self, texts: List[str]) -> sparse.csr_matrix:
        tfidf_mat = self.vectorizer.fit_transform(texts)
        dense_mat = extract_dense_features(texts)
        dense_sparse = sparse.csr_matrix(dense_mat)
        return sparse.hstack([tfidf_mat, dense_sparse], format="csr")
