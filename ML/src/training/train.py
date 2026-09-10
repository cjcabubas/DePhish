"""
train.py - Fits the production phishing detection model and exports model artifacts.
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score

# Ensure ml root is in sys.path
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.features.text_features import CombinedFeaturePipeline, get_dense_feature_names


def train_model(
    train_path: Path,
    models_dir: Path,
    c_param: float = 2.0,
    max_features: int = 15000,
    model_version: str = "1.0.0"
):
    print("=" * 60)
    print("  DePhish Production Model Training")
    print("=" * 60)

    if not train_path.exists():
        raise FileNotFoundError(f"Training dataset not found: {train_path}")

    train_df = pd.read_csv(train_path).dropna(subset=["text"])
    print(f"Loaded {len(train_df):,} training examples.")
    print(f"Class counts:\n{train_df['check'].value_counts()}")

    # 1. Initialize and fit feature pipeline
    print(f"\nFitting TF-IDF Vectorizer (max_features={max_features}) and extracting features...")
    pipeline = CombinedFeaturePipeline()
    pipeline.vectorizer.max_features = max_features

    t0 = time.time()
    X_train = pipeline.fit_transform(train_df["text"].tolist())
    feat_time = time.time() - t0
    y_train = train_df["check"].values
    print(f"Extracted {X_train.shape[1]:,} features in {feat_time:.2f}s.")

    # 2. Train Calibrated Linear SVM model with calibrated probability outputs
    print(f"\nTraining Calibrated Linear SVM (LinearSVC C={c_param})...")
    from sklearn.svm import LinearSVC
    from sklearn.calibration import CalibratedClassifierCV
    base_svc = LinearSVC(C=c_param, dual=False, random_state=42)
    model = CalibratedClassifierCV(estimator=base_svc, cv=5)

    t1 = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - t1
    print(f"Model fitted successfully in {train_time:.2f}s.")

    # Internal training set evaluation
    preds = model.predict(X_train)
    probs = model.predict_proba(X_train)[:, 1]
    acc = accuracy_score(y_train, preds)
    f1 = f1_score(y_train, preds)
    prec = precision_score(y_train, preds)
    rec = recall_score(y_train, preds)
    roc = roc_auc_score(y_train, probs)

    print("\nTraining Set Performance:")
    print(f"  Accuracy:  {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall:    {rec:.4f}")
    print(f"  F1 Score:  {f1:.4f}")
    print(f"  ROC-AUC:   {roc:.4f}")

    # 3. Export Artifacts
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / "phishing_model.pkl"
    vec_path = models_dir / "tfidf_vectorizer.pkl"
    meta_path = models_dir / "metadata.json"

    print(f"\nSaving model to: {model_path}")
    joblib.dump(model, model_path, compress=3)

    print(f"Saving vectorizer to: {vec_path}")
    joblib.dump(pipeline.vectorizer, vec_path, compress=3)

    metadata = {
        "model_name": "DePhish-Classifier",
        "model_type": "CalibratedLinearSVC",
        "version": model_version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "num_training_samples": len(train_df),
        "vocab_size": len(pipeline.vectorizer.vocabulary_),
        "num_dense_features": len(pipeline.dense_feature_names),
        "total_features": int(X_train.shape[1]),
        "dense_features": pipeline.dense_feature_names,
        "hyperparameters": {
            "C": c_param,
            "max_features": max_features,
            "calibration_cv": 5,
        },
        "training_metrics": {
            "accuracy": round(float(acc), 4),
            "precision": round(float(prec), 4),
            "recall": round(float(rec), 4),
            "f1": round(float(f1), 4),
            "roc_auc": round(float(roc), 4),
        },
    }

    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"Metadata saved to: {meta_path}")
    print("=" * 60)
    print("Training process completed successfully.")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train DePhish detection model")
    default_train = BASE_DIR / "data" / "processed" / "train.csv"
    default_models = BASE_DIR / "models"

    parser.add_argument("--train-data", type=Path, default=default_train)
    parser.add_argument("--models-dir", type=Path, default=default_models)
    parser.add_argument("--c", type=float, default=2.0)
    parser.add_argument("--max-features", type=int, default=15000)
    parser.add_argument("--version", type=str, default="1.0.0")

    args = parser.parse_args()
    train_model(args.train_data, args.models_dir, args.c, args.max_features, args.version)
