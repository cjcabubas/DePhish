"""
evaluate.py - Evaluates trained DePhish model on the test dataset and exports performance reports.
"""

import os
import sys
import json
import argparse
from pathlib import Path

import joblib
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report
)

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.features.text_features import CombinedFeaturePipeline


def evaluate_model(
    test_path: Path,
    models_dir: Path,
    reports_dir: Path
):
    print("=" * 60)
    print("  DePhish Model Evaluation")
    print("=" * 60)

    model_file = models_dir / "phishing_model.pkl"
    vec_file = models_dir / "tfidf_vectorizer.pkl"

    if not model_file.exists() or not vec_file.exists():
        raise FileNotFoundError(f"Model artifacts not found in {models_dir}")
    if not test_path.exists():
        raise FileNotFoundError(f"Test dataset not found at {test_path}")

    print("Loading test data and trained artifacts...")
    test_df = pd.read_csv(test_path).dropna(subset=["text"])
    model = joblib.load(model_file)
    vectorizer = joblib.load(vec_file)

    pipeline = CombinedFeaturePipeline(vectorizer=vectorizer)
    print(f"Transforming {len(test_df):,} test samples...")
    X_test = pipeline.transform(test_df["text"].tolist())
    y_test = test_df["check"].values

    preds = model.predict(X_test)
    probs = model.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, preds)
    prec = precision_score(y_test, preds, zero_division=0)
    rec = recall_score(y_test, preds, zero_division=0)
    f1 = f1_score(y_test, preds, zero_division=0)
    roc = roc_auc_score(y_test, probs)
    cm = confusion_matrix(y_test, preds)
    tn, fp, fn, tp = cm.ravel()

    print("\nTest Evaluation Results:")
    print(f"  Accuracy:         {acc:.4f}")
    print(f"  Precision:        {prec:.4f}")
    print(f"  Recall:           {rec:.4f}")
    print(f"  F1-Score:         {f1:.4f}")
    print(f"  ROC-AUC:          {roc:.4f}")
    print(f"  True Negatives:   {tn:,}")
    print(f"  False Positives:  {fp:,}")
    print(f"  False Negatives:  {fn:,}")
    print(f"  True Positives:   {tp:,}")

    print("\nFull Classification Report:")
    report_dict = classification_report(y_test, preds, target_names=["Legitimate (0)", "Phishing (1)"], output_dict=True)
    print(classification_report(y_test, preds, target_names=["Legitimate (0)", "Phishing (1)"]))

    # Save reports
    reports_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = reports_dir / "metrics.json"

    metrics_payload = {
        "test_samples": int(len(test_df)),
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "roc_auc": round(float(roc), 4),
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp),
        },
        "classification_report": report_dict,
    }

    with metrics_path.open("w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"Metrics saved to: {metrics_path}")

    # Plot confusion matrix
    cm_path = reports_dir / "confusion_matrix.png"
    plt.figure(figsize=(6, 5))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=["Legitimate", "Phishing"],
        yticklabels=["Legitimate", "Phishing"],
    )
    plt.title("DePhish Confusion Matrix")
    plt.ylabel("Actual Label")
    plt.xlabel("Predicted Label")
    plt.tight_layout()
    plt.savefig(cm_path, dpi=300)
    plt.close()
    print(f"Confusion matrix plot saved to: {cm_path}")

    # Export misclassified samples for error analysis
    misclassified_mask = y_test != preds
    mis_df = test_df[misclassified_mask].copy()
    mis_df["predicted"] = preds[misclassified_mask]
    mis_df["phishing_prob"] = np.round(probs[misclassified_mask], 4)
    mis_path = reports_dir / "misclassified.csv"
    mis_df.to_csv(mis_path, index=False, encoding="utf-8")
    print(f"Misclassified samples ({len(mis_df):,}) saved to: {mis_path}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate DePhish detection model")
    default_test = BASE_DIR / "data" / "processed" / "test.csv"
    default_models = BASE_DIR / "models"
    default_reports = BASE_DIR / "reports"

    parser.add_argument("--test-data", type=Path, default=default_test)
    parser.add_argument("--models-dir", type=Path, default=default_models)
    parser.add_argument("--reports-dir", type=Path, default=default_reports)

    args = parser.parse_args()
    evaluate_model(args.test_data, args.models_dir, args.reports_dir)
