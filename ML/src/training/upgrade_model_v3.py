"""One versioned original-case candidate. Promotion requires the fixed comparison gate."""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import StratifiedGroupKFold

BASE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE))
from src.features.model_v3 import build_original_case_candidate
from src.inference.predict import PhishingDetector
from src.training.upgrade_model import group_key, measure


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--promote', action='store_true')
    args = parser.parse_args()
    output = BASE / 'reports/model_upgrade_v3'
    output.mkdir(parents=True, exist_ok=True)
    train = pd.read_csv(BASE / 'data/processed/train.csv').dropna(subset=['text'])
    test = pd.read_csv(BASE / 'data/processed/test.csv').dropna(subset=['text'])
    train['group'] = train.text.map(group_key)
    conflicts = train.groupby('group').check.nunique()
    train = train[~train.group.isin(conflicts[conflicts > 1].index)].drop_duplicates('group').reset_index(drop=True)
    folds = list(StratifiedGroupKFold(3, shuffle=True, random_state=42).split(train.text, train.check, train.group))
    active = PhishingDetector()
    if active.metadata.get('version') != '2.0.0':
        raise ValueError('This comparison expects active model v2.0.0; review the baseline before another promotion.')
    candidate = CalibratedClassifierCV(build_original_case_candidate(), cv=folds, method='sigmoid', ensemble=True, n_jobs=1)
    print(f'Training v3 original-case candidate on {len(train)} templates.', flush=True)
    candidate.fit(train.text.to_numpy(), train.check.to_numpy())
    path = output / 'candidate.pkl'
    joblib.dump(candidate, path, compress=3)
    new, old = [], []
    for start in range(0, len(test), 128):
        texts = test.text.iloc[start:start + 128].tolist()
        new.extend(candidate.predict_proba(texts)[:, 1])
        old.extend(active.predict_probabilities(texts)[:, 1])
    y, new, old = test.check.to_numpy(), np.array(new), np.array(old)
    clean = ~test.text.map(group_key).isin(set(train.group)).to_numpy()
    baseline, result = measure(y, old), measure(y, new)
    gate = (result['binary']['f1'] >= baseline['binary']['f1'] and
            result['warning']['recall'] >= baseline['warning']['recall'] and
            result['warning']['false_positives'] <= baseline['warning']['false_positives'] and
            measure(y[clean], new[clean])['binary']['f1'] >= measure(y[clean], old[clean])['binary']['f1'])
    comparison = {'baseline_version': active.metadata['version'], 'baseline': baseline, 'candidate': result,
                  'promotion_gate_passed': bool(gate), 'training_rows': len(train),
                  'note': 'Fixed candidate and thresholds. This existing test set has been used for prior comparisons; results are not a fresh unbiased generalization estimate.'}
    (output / 'comparison.json').write_text(json.dumps(comparison, indent=2), encoding='utf-8')
    print(json.dumps(comparison, indent=2), flush=True)
    if args.promote and gate:
        metadata_path = BASE / 'models/metadata.json'
        backup = BASE / 'models/metadata-v2.json'
        if not backup.exists():
            backup.write_bytes(metadata_path.read_bytes())
        target = BASE / 'models/phishing_pipeline_v3.pkl'
        target.write_bytes(path.read_bytes())
        metadata = {**active.metadata, 'version': '3.0.0', 'pipeline_file': target.name,
                    'trained_at': datetime.now(timezone.utc).isoformat(),
                    'artifact_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                    'evaluation_metrics': comparison,
                    'training': {'rows': len(train), 'folds': 3, 'feature_version': 'original-case-v3'},
                    'limitations': [*active.metadata.get('limitations', []), comparison['note']]}
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding='utf-8')
        print('Promoted v3; v2 artifact and metadata remain available for rollback.', flush=True)
    elif args.promote:
        print('Gate did not pass. Active model unchanged.', flush=True)


if __name__ == '__main__':
    main()
