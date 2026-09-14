"""Reproducible, read-only data audit and deployed-policy benchmark.
Does not retrain, relabel examples, or tune thresholds against the test set.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, precision_score, recall_score, brier_score_loss

BASE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE))
from src.inference.predict import PhishingDetector, score_prediction
from src.features.url_features import extract_urls, analyze_url


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical(text):
    text = re.sub(r'https?://\S+|www\.\S+', '<url>', text.lower())
    text = re.sub(r'\b\d+\b', '<number>', text)
    return re.sub(r'\s+', ' ', text).strip()


def metrics(labels, scores):
    levels = np.where(scores >= 70, 2, np.where(scores >= 35, 1, 0))
    output = {'counts_by_risk': dict(zip(['low', 'medium', 'high'], [int(sum(levels == i)) for i in range(3)])),
              'label_by_risk_matrix': [[int(sum((labels == y) & (levels == i))) for i in range(3)] for y in range(2)]}
    for name, flagged in [('medium_or_high', levels >= 1), ('high_only', levels == 2)]:
        tn, fp, fn, tp = confusion_matrix(labels, flagged, labels=[0,1]).ravel()
        output[name] = {'precision': float(precision_score(labels, flagged, zero_division=0)),
                        'recall': float(recall_score(labels, flagged, zero_division=0)),
                        'false_positives': int(fp), 'missed_positive_labels': int(fn),
                        'false_positive_rate': float(fp / max(1, tn + fp))}
    return output


def main():
    out = BASE / 'reports' / 'scanner_audit'
    out.mkdir(parents=True, exist_ok=True)
    train_path, test_path = [BASE / 'data' / 'processed' / f'{split}.csv' for split in ['train','test']]
    train, test = [pd.read_csv(p).dropna(subset=['text']) for p in [train_path,test_path]]
    detector = PhishingDetector()
    probabilities, old_scores = [], []
    names = detector.pipeline.dense_feature_names
    for start in range(0, len(test), 128):
        texts = test.text.iloc[start:start+128].tolist()
        x = detector.pipeline.transform(texts)
        prob = detector.model.predict_proba(x)[:,1]
        dense = x[:, -len(names):].toarray()
        get = lambda name: dense[:, names.index(name)]
        suspicious_url = np.array([any(u['is_ip'] or u['has_at_symbol'] or u['is_suspicious_tld'] or u['is_shortener'] for u in map(analyze_url, extract_urls(text))) for text in texts])
        boost = np.minimum(15, get('ind_high_severity') * 5) + suspicious_url * 10
        probabilities.extend(prob.tolist())
        old_scores.extend(np.round(np.clip(prob * 100 + boost, 0, 100), 1).tolist())
    # Apply the same scoring function as live inference. Decisions use unrounded probabilities.
    new_scores = np.array(probabilities) * 100
    labels = test.check.to_numpy()
    report = {'model_sha256': fingerprint(detector.model_path), 'vectorizer_sha256': fingerprint(detector.vec_path),
              'train_sha256': fingerprint(train_path), 'test_sha256': fingerprint(test_path),
              'test_samples': len(test), 'scoring_version': '2.0.0',
              'thresholds': {'medium': .35, 'high': .70, 'selection': 'Existing thresholds retained; not tuned on test set'},
              'limitations': ['Labels have not been independently verified as phishing rather than spam.',
                             'Random historical split is not evidence of performance on new campaigns or Filipino/Taglish messages.',
                             'Template overlap is a heuristic audit, not proof of leakage.'],
              'legacy_boosted': metrics(labels, np.array(old_scores)), 'unboosted': metrics(labels, new_scores),
              'model_brier_score': float(brier_score_loss(labels, probabilities)), 'by_message_type': {}}
    for kind in sorted(test.type.unique()):
        mask = (test.type == kind).to_numpy()
        report['by_message_type'][kind] = {'samples': int(sum(mask)), 'unboosted': metrics(labels[mask], new_scores[mask])}
    bins = []
    for low in np.arange(0, 1, .1):
        p = np.array(probabilities); mask = (p >= low) & (p < low + .1 if low < .9 else p <= 1)
        if sum(mask): bins.append({'lower': round(float(low),1), 'count': int(sum(mask)), 'mean_estimate': float(p[mask].mean()), 'positive_fraction': float(labels[mask].mean())})
    report['calibration_bins'] = bins
    joined = pd.concat([train.assign(split='train'),test.assign(split='test')], ignore_index=True)
    joined['normalized'] = joined.text.str.lower().str.replace(r'\s+', ' ', regex=True).str.strip()
    joined['template'] = joined.text.map(canonical)
    conflicts = set(joined.groupby('normalized').check.nunique().loc[lambda s:s>1].index)
    train_templates = set(joined.loc[joined.split=='train','template'])
    overlapping = joined[(joined.split=='test') & joined.template.isin(train_templates)]
    report['audit'] = {'conflicting_normalized_texts': len(conflicts),
                       'test_exact_normalized_overlap': int(test.text.str.lower().str.replace(r'\s+',' ',regex=True).str.strip().isin(set(joined.loc[joined.split=='train','normalized'])).sum()),
                       'test_template_overlap': len(overlapping)}
    queue = test.copy();queue['model_probability'] = probabilities
    queue['risk_level'] = [score_prediction(p)['risk_level'] for p in probabilities]
    queue['review_reason'] = ['positive_label_low_risk' if y==1 and p<.35 else 'negative_label_high_risk' if y==0 and p>=.70 else '' for y,p in zip(labels, probabilities)]
    queue = queue[queue.review_reason != ''].copy()
    queue['reviewed_label'] = '';queue['reviewer_notes'] = ''
    queue.to_csv(out/'label_review_queue.csv', index=False)
    joined[joined.normalized.isin(conflicts)][['split','type','text','check']].to_csv(out/'conflicting_labels.csv', index=False)
    overlapping[['type','text','check']].to_csv(out/'template_overlap.csv', index=False)
    (out/'benchmark.json').write_text(json.dumps(report, indent=2))
    challenge = json.loads((BASE / 'tests' / 'fixtures' / 'local_challenge.json').read_text(encoding='utf-8'))
    for row in challenge:
        result = detector.analyze(row['text'], row['type'])
        row.update(prediction=result['prediction'], risk_score=result['risk_score'], flagged=result['prediction'] != 'Legitimate')
    (out / 'local_challenge_results.json').write_text(json.dumps(challenge, indent=2))
    print(json.dumps({k:report[k] for k in ['test_samples','legacy_boosted','unboosted','audit']}, indent=2))

if __name__ == '__main__':
    main()
