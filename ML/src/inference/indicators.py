"""Independent observations over original text; never assigns a risk score."""
from src.features.indicator_features import extract_indicators, classify_phishing_type, INDICATOR_PATTERNS
from src.inference.evidence import detailed_indicators


def analyze_indicators(original_text, has_url=False, normalized_text=None):
    indicators = detailed_indicators(original_text, extract_indicators(original_text), INDICATOR_PATTERNS)
    if normalized_text and normalized_text != original_text:
        known = {item['category'] for item in indicators}
        for item in detailed_indicators(normalized_text, extract_indicators(normalized_text), INDICATOR_PATTERNS):
            if item['category'] not in known and item['category'] != 'structural_anomalies':
                # Normalization changes offsets. Never present normalized spans as original evidence.
                indicators.append({**item, 'evidence': [], 'source': 'normalized_pattern',
                                   'evidence_text_basis': 'normalized_text'})
                known.add(item['category'])
    specific = {'secret_disclosure': 'Security Secret Solicitation', 'payment_redirection': 'Payment Redirection',
                'remote_access': 'Remote Access Solicitation', 'security_bypass': 'Security Bypass Request'}
    category = next((specific[item['category']] for item in indicators if item['category'] in specific),
                    classify_phishing_type(indicators, has_url=has_url))
    letters = [char for char in original_text if char.isalpha()]
    return {'status': 'complete', 'indicators': indicators, 'phishing_type': category,
            'formatting': {'uppercaseRatio': sum(char.isupper() for char in letters) / len(letters) if letters else 0,
                           'exclamationCount': original_text.count('!')},
            'note': 'Original-text observations. Severity is explanatory, not extra model probability or policy points.'}
