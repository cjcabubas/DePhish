"""
preprocess.py - Cleans, deduplicates, and splits the DePhish dataset into train and test sets.
"""

import os
import sys
import csv
import re
import argparse
from pathlib import Path
import pandas as pd
from sklearn.model_selection import train_test_split


def clean_text(text: str) -> str:
    """Basic text sanitization for raw email/SMS text."""
    if not isinstance(text, str):
        return ""
    # Normalize unicode / multiple spaces
    text = re.sub(r"\s+", " ", text)
    # Remove null bytes or non-printable chars except standard whitespace
    text = "".join(ch for ch in text if ch.isprintable() or ch in ("\n", "\t", "\r"))
    return text.strip()


def run_preprocessing(
    input_path: Path,
    output_dir: Path,
    test_size: float = 0.2,
    random_state: int = 42
):
    print(f"Reading dataset from: {input_path}")
    if not input_path.exists():
        raise FileNotFoundError(f"Dataset file not found: {input_path}")

    # Configure CSV field size limit
    field_limit = 2**31 - 1
    while True:
        try:
            csv.field_size_limit(field_limit)
            break
        except OverflowError:
            field_limit //= 2

    records = []
    with input_path.open("r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_text = row.get("text", "")
            raw_type = row.get("type", "email").strip().lower()
            raw_check = row.get("check", "").strip()

            if raw_check not in ("0", "1"):
                continue

            cleaned = clean_text(raw_text)
            if not cleaned or len(cleaned) < 3:
                continue

            records.append({
                "type": raw_type,
                "text": cleaned,
                "check": int(raw_check)
            })

    df = pd.DataFrame(records)
    print(f"Loaded {len(df):,} valid rows.")

    # Deduplicate based on text
    initial_len = len(df)
    df = df.drop_duplicates(subset=["text"], keep="first").reset_index(drop=True)
    dedup_removed = initial_len - len(df)
    print(f"Removed {dedup_removed:,} duplicates. Unique rows: {len(df):,}")

    output_dir.mkdir(parents=True, exist_ok=True)

    # Master cleaned dataset
    master_path = output_dir / "dataset.csv"
    df.to_csv(master_path, index=False, encoding="utf-8")
    print(f"Saved master cleaned dataset to: {master_path}")

    # Stratified Train/Test Split on combined (type + check)
    df["stratify_key"] = df["type"] + "_" + df["check"].astype(str)
    train_df, test_df = train_test_split(
        df,
        test_size=test_size,
        random_state=random_state,
        stratify=df["stratify_key"]
    )

    train_df = train_df.drop(columns=["stratify_key"]).reset_index(drop=True)
    test_df = test_df.drop(columns=["stratify_key"]).reset_index(drop=True)

    train_path = output_dir / "train.csv"
    test_path = output_dir / "test.csv"

    train_df.to_csv(train_path, index=False, encoding="utf-8")
    test_df.to_csv(test_path, index=False, encoding="utf-8")

    print(f"Train split saved to: {train_path} ({len(train_df):,} samples)")
    print(f"Test split saved to:  {test_path} ({len(test_df):,} samples)")

    print("\nTrain distribution:")
    print(train_df["check"].value_counts(normalize=True).rename({0: "Legitimate (0)", 1: "Phishing (1)"}))
    print("\nTest distribution:")
    print(test_df["check"].value_counts(normalize=True).rename({0: "Legitimate (0)", 1: "Phishing (1)"}))

    return train_path, test_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess and split DePhish dataset")
    base_dir = Path(__file__).resolve().parents[2]
    default_input = base_dir / "data" / "processed" / "phishing_dataset.csv"
    default_output = base_dir / "data" / "processed"

    parser.add_argument("--input", type=Path, default=default_input, help="Input CSV file")
    parser.add_argument("--output-dir", type=Path, default=default_output, help="Output directory")
    parser.add_argument("--test-size", type=float, default=0.2, help="Test size fraction")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")

    args = parser.parse_args()
    run_preprocessing(args.input, args.output_dir, args.test_size, args.seed)
