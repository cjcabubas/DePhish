"""
compare_models.py - Benchmarks multiple classifier architectures on the DePhish dataset.
"""

import time
import argparse
from pathlib import Path
import pandas as pd
import numpy as np

from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.features.text_features import CombinedFeaturePipeline


def run_benchmark(train_path: Path, test_path: Path):
    print("=" * 60)
    print("  DePhish Model Comparison Benchmark")
    print("=" * 60)

    train_df = pd.read_csv(train_path).dropna(subset=["text"])
    test_df = pd.read_csv(test_path).dropna(subset=["text"])

    print(f"Loaded {len(train_df):,} train samples, {len(test_df):,} test samples.")

    print("Extracting features (TF-IDF + URL + heuristic indicators)...")
    pipeline = CombinedFeaturePipeline()
    X_train = pipeline.fit_transform(train_df["text"].tolist())
    y_train = train_df["check"].values

    X_test = pipeline.transform(test_df["text"].tolist())
    y_test = test_df["check"].values

    print(f"Feature matrix shape: Train {X_train.shape}, Test {X_test.shape}")

    models = {
        "Multinomial Naive Bayes": MultinomialNB(alpha=0.1),
        "Calibrated Logistic Regression": LogisticRegression(C=2.0, max_iter=1000, random_state=42),
        "Calibrated Linear SVM": CalibratedClassifierCV(LinearSVC(C=1.0, dual=False, random_state=42)),
        "Random Forest (100 trees)": RandomForestClassifier(n_estimators=100, max_depth=30, random_state=42, n_jobs=-1),
    }

    results = []

    for name, clf in models.items():
        print(f"\nEvaluating: {name} ...")
        t0 = time.perf_counter()
        clf.fit(X_train, y_train)
        train_time = time.perf_counter() - t0

        t1 = time.perf_counter()
        preds = clf.predict(X_test)
        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba(X_test)[:, 1]
        else:
            probs = preds
        test_time = time.perf_counter() - t1

        acc = accuracy_score(y_test, preds)
        prec = precision_score(y_test, preds, zero_division=0)
        rec = recall_score(y_test, preds, zero_division=0)
        f1 = f1_score(y_test, preds, zero_division=0)
        roc = roc_auc_score(y_test, probs)

        results.append({
            "Model": name,
            "Accuracy": f"{acc:.4f}",
            "Precision": f"{prec:.4f}",
            "Recall": f"{rec:.4f}",
            "F1-Score": f"{f1:.4f}",
            "ROC-AUC": f"{roc:.4f}",
            "Train Time (s)": f"{train_time:.2f}",
            "Inference (ms/sample)": f"{(test_time / len(y_test)) * 1000:.3f}",
        })

    results_df = pd.DataFrame(results)
    print("\n" + "=" * 80)
    print(results_df.to_string(index=False))
    print("=" * 80)


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parents[2]
    train_file = base_dir / "data" / "processed" / "train.csv"
    test_file = base_dir / "data" / "processed" / "test.csv"
    run_benchmark(train_file, test_file)
