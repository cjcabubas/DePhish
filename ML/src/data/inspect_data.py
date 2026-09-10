"""
inspect_data.py - Inspects and reports statistics for the DePhish dataset.
"""

import os
import sys
import csv
from collections import Counter
from pathlib import Path


def inspect_dataset(data_path: Path):
    if not data_path.exists():
        print(f"Error: Dataset not found at {data_path}")
        sys.exit(1)

    field_limit = 2**31 - 1
    while True:
        try:
            csv.field_size_limit(field_limit)
            break
        except OverflowError:
            field_limit //= 2

    type_counts = Counter()
    label_counts = Counter()
    type_label_counts = Counter()
    text_lengths = []
    empty_count = 0
    unique_texts = set()
    duplicate_count = 0
    total_rows = 0

    with data_path.open("r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            text = row.get("text", "").strip()
            msg_type = row.get("type", "unknown").strip().lower()
            label = row.get("check", "unknown").strip()

            type_counts[msg_type] += 1
            label_counts[label] += 1
            type_label_counts[(msg_type, label)] += 1

            if not text:
                empty_count += 1
            else:
                text_lengths.append(len(text))
                if text in unique_texts:
                    duplicate_count += 1
                else:
                    unique_texts.add(text)

    print("=" * 60)
    print(f"  DePhish Dataset Inspection: {data_path.name}")
    print("=" * 60)
    print(f"Total records:      {total_rows:,}")
    print(f"Unique texts:       {len(unique_texts):,}")
    print(f"Duplicate texts:    {duplicate_count:,}")
    print(f"Empty texts:        {empty_count:,}")
    print("-" * 60)
    print("Message Types:")
    for mtype, count in type_counts.most_common():
        pct = (count / total_rows) * 100 if total_rows else 0
        print(f"  - {mtype:10s}: {count:6,} ({pct:.1f}%)")
    print("-" * 60)
    print("Labels (0=Legitimate, 1=Phishing):")
    for label, count in sorted(label_counts.items()):
        name = "Legitimate" if label == "0" else "Phishing" if label == "1" else "Unknown"
        pct = (count / total_rows) * 100 if total_rows else 0
        print(f"  - [{label}] {name:10s}: {count:6,} ({pct:.1f}%)")
    print("-" * 60)
    print("Breakdown by Type and Label:")
    for (mtype, label), count in sorted(type_label_counts.items()):
        name = "Legitimate" if label == "0" else "Phishing" if label == "1" else "Unknown"
        print(f"  - {mtype:6s} | {label} ({name:10s}): {count:6,}")
    if text_lengths:
        print("-" * 60)
        print(f"Text Lengths (chars):")
        print(f"  - Min:    {min(text_lengths):,}")
        print(f"  - Max:    {max(text_lengths):,}")
        print(f"  - Median: {sorted(text_lengths)[len(text_lengths) // 2]:,}")
        print(f"  - Mean:   {sum(text_lengths) // len(text_lengths):,}")
    print("=" * 60)


if __name__ == "__main__":
    base_dir = Path(__file__).resolve().parents[2]
    target = base_dir / "data" / "processed" / "phishing_dataset.csv"
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
    inspect_dataset(target)
