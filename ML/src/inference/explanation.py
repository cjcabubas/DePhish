"""Exact additive margin attribution for the shipped calibrated linear ensemble.

Contributions explain the pre-calibration SVM margins, not probability changes.
Only observed, nonzero features contribute; calibration is nonlinear.
"""
from collections import defaultdict
import numpy as np
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS


def explain_model(model, text, probability):
    folds = getattr(model, 'calibrated_classifiers_', [])
    if not folds or not all(hasattr(f.estimator, 'named_steps') for f in folds):
        return {'available': False, 'method': 'unsupported_model',
                'note': 'Learned feature explanations are available for the v2 linear model.'}
    totals = defaultdict(float)
    words = defaultdict(float)
    probabilities = []
    bias = 0.0
    for fold in folds:
        estimator = fold.estimator
        union = estimator.named_steps['features']
        classifier = estimator.named_steps['classifier']
        row = union.transform([text]).tocsr()
        contributions = row.multiply(classifier.coef_[0]).tocsr()
        offset = 0
        for name, transformer in union.transformer_list:
            if name in ('word', 'char'):
                size = len(transformer.vocabulary_)
            else:
                size = transformer.named_steps['scale'].n_features_in_
            group = contributions[:, offset:offset+size]
            totals[name] += float(group.sum()) / len(folds)
            if name == 'word':
                terms = transformer.get_feature_names_out()
                for index, value in zip(group.indices, group.data):
                    words[str(terms[index])] += float(value) / len(folds)
            offset += size
        bias += float(classifier.intercept_[0]) / len(folds)
        margin = float(contributions.sum()) + float(classifier.intercept_[0])
        probabilities.append(float(fold.calibrators[0].predict(np.array([margin]))[0]))
    ranked = sorted(words.items(), key=lambda item: abs(item[1]), reverse=True)
    def top(direction):
        selected = []
        for term, contribution in ranked:
            if contribution * direction <= 0:
                continue
            if all(token in ENGLISH_STOP_WORDS for token in term.split()):
                continue
            # Avoid showing a bigram and its individual words as three findings.
            if any(f' {term} ' in f" {previous['term']} " or f" {previous['term']} " in f' {term} '
                   for previous in selected):
                continue
            selected.append({'term': term, 'contribution': round(contribution, 6)})
            if len(selected) == 5:
                break
        return selected
    distance = min(abs(probability - .35), abs(probability - .70))
    return {'available': True, 'method': 'mean_linear_svm_margin',
            'toward_phishing': top(1), 'toward_legitimate': top(-1),
            'feature_groups': [{'name': name, 'contribution': round(value, 6)} for name, value in totals.items()],
            'bias': round(bias, 6), 'mean_margin': round(bias + sum(totals.values()), 6),
            'fold_probability_range': {'min': round(min(probabilities), 4), 'max': round(max(probabilities), 4)},
            'near_threshold': distance <= .05,
            'threshold_distance_points': round(distance * 100, 1),
            'note': 'Selected informative word contributions are learned associations, not proof of fraud. Common function words are omitted from the phrase lists, but remain in the group totals. Positive values push the SVM margin toward phishing; negative values push toward legitimate. Character and structured features also contribute. Margin units are not risk points or probability changes. Fold ranges show model variation, not a confidence interval.'}
