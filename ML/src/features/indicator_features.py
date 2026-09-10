"""
indicator_features.py - Rule-based phishing and social engineering indicator extractor.
Aligned with DePhish objectives: Explainable risk factors, phishing type classification,
and feature extraction for ML training.
"""

import re
from typing import List, Dict, Any, Tuple


INDICATOR_PATTERNS = {
    "urgency_pressure": {
        "title": "Urgency and Coercion",
        "description": "Uses urgent deadlines, fear, or panic tactics to force hasty compliance.",
        "severity": "high",
        "patterns": [
            r"\bimmediate(?:ly)?\s+action\b",
            r"\bact\s+now\b",
            r"\baccount\s+(?:will\s+be\s+)?(?:suspended|disabled|locked|terminated|closed)\b",
            r"\bwithin\s+(?:\d{1,2}|twenty-four|48)\s*(?:hours?|hrs?)\b",
            r"\bfinal\s+notice\b",
            r"\blast\s+warning\b",
            r"\bunauthorized\s+(?:access|transaction|activity|login)\b",
            r"\bsuspicious\s+activity\s+detected\b",
            r"\burgent(?:ly)?\b",
            r"\bfailure\s+to\s+(?:respond|comply|verify)\b",
            r"\bsecurity\s+alert\b",
        ],
    },
    "credential_harvesting": {
        "title": "Credential or Identity Solicitation",
        "description": "Prompts recipient to submit, verify, or reset sensitive credentials.",
        "severity": "high",
        "patterns": [
            r"\bverify\s+your\s+(?:account|identity|password|pin|credentials)\b",
            r"\bconfirm\s+your\s+(?:password|identity|account|details|info)\b",
            r"\blogin\s+credentials\b",
            r"\bupdate\s+your\s+(?:billing|payment|account|password)\b",
            r"\breset\s+(?:your\s+)?password\b",
            r"\bre-activate\s+your\s+account\b",
            r"\bvalidate\s+(?:your\s+)?account\b",
            r"\bsign[\s-]?in\s+to\s+(?:verify|reactivate|keep)\b",
            r"\benter\s+(?:your\s+)?(?:password|pin|ssn|otp)\b",
        ],
    },
    "financial_bait": {
        "title": "Financial Bait or Prize Lure",
        "description": "Entices recipient with fake cash prizes, lottery payouts, refunds, or crypto gains.",
        "severity": "medium",
        "patterns": [
            r"\bcongratulations\b.*\b(?:won|winner|prize|selected)\b",
            r"\bclaim\s+(?:your\s+)?(?:prize|reward|gift\s*card|refund|cash)\b",
            r"\blottery\s+(?:winner|winning|jackpot)\b",
            r"\bwire\s+transfer\b",
            r"\bbitcoin\b|\bcrypto\s+currency\b|\beth\s+wallet\b",
            r"\binheritance\s+(?:fund|claim|sum)\b",
            r"\bguaranteed\s+(?:profit|return|income)\b",
            r"\bfree\s+(?:gift\s*card|voucher|iphone|cash)\b",
            r"\b\$\s*\d{2,}(?:,\d{3})*(?:\.\d{2})?\s+(?:credited|deposited|won|ready)\b",
        ],
    },
    "impersonation": {
        "title": "Brand or Authority Impersonation",
        "description": "Poses as reputable banks, technology vendors, or security departments.",
        "severity": "medium",
        "patterns": [
            r"\bpaypal\s+(?:security|team|support|alert)\b",
            r"\bapple\s+(?:id|security|support|team)\b",
            r"\bmicrosoft\s+(?:security|account|support)\b",
            r"\bgoogle\s+(?:security|verification|team)\b",
            r"\bbank\s+(?:of\s+america|security|alert|fraud\s+department)\b",
            r"\bwells\s+fargo\b|\bchase\s+bank\b|\bnetflix\s+billing\b",
            r"\binternal\s+revenue\s+service\b|\birs\s+refund\b",
            r"\bcustomer\s+support\s+desk\b|\bit\s+helpdesk\b",
        ],
    },
    "call_to_action": {
        "title": "Suspicious Call to Action",
        "description": "Nudges recipient to click ambiguous links or dial untrusted numbers.",
        "severity": "low",
        "patterns": [
            r"\bclick\s+(?:here|below|the\s+link|this\s+link)\b",
            r"\bopen\s+the\s+attached\s+(?:file|document|invoice|pdf)\b",
            r"\bdownload\s+attachment\b",
            r"\bcall\s+(?:us\s+)?(?:at\s+)?(?:toll[\s-]free|now)?\b",
            r"\bscan\s+the\s+qr\s+code\b",
        ],
    },
}

PHONE_REGEX = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}")


def extract_indicators(text: str) -> List[Dict[str, Any]]:
    """
    Scans text against heuristic phishing indicators.
    Returns a list of detected indicators with category, matched text, and explanation.
    """
    if not text:
        return []

    detected = []
    text_lower = text.lower()

    for cat_key, cat_meta in INDICATOR_PATTERNS.items():
        matched_phrases = []
        for pat in cat_meta["patterns"]:
            matches = re.findall(pat, text_lower, re.IGNORECASE)
            if matches:
                for m in matches:
                    cleaned_m = m.strip() if isinstance(m, str) else str(m)
                    if cleaned_m and cleaned_m not in matched_phrases:
                        matched_phrases.append(cleaned_m)

        if matched_phrases:
            detected.append({
                "category": cat_key,
                "title": cat_meta["title"],
                "description": cat_meta["description"],
                "severity": cat_meta["severity"],
                "matched_terms": matched_phrases[:5],  # Top 5 unique matches
            })

    # Structural anomalies
    structural_flags = []
    # 1. High uppercase ratio
    letters = [ch for ch in text if ch.isalpha()]
    if letters:
        upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
        if upper_ratio > 0.35 and len(text) > 40:
            structural_flags.append(f"High uppercase text ({upper_ratio * 100:.0f}%) indicating urgency/shouting")

    # 2. Exclamation marks
    exclamation_count = text.count("!")
    if exclamation_count >= 3:
        structural_flags.append(f"Excessive exclamation marks ({exclamation_count} detected)")

    # 3. Currency symbols count
    currency_count = len(re.findall(r"[\$\£\€]", text))
    if currency_count >= 3:
        structural_flags.append(f"Multiple currency symbols ({currency_count} detected)")

    # 4. Phone numbers
    phone_matches = PHONE_REGEX.findall(text)
    if phone_matches:
        structural_flags.append(f"Direct phone contact solicitation: {phone_matches[0]}")

    if structural_flags:
        detected.append({
            "category": "structural_anomalies",
            "title": "Message Formatting Anomalies",
            "description": "Contains atypical formatting cues frequently correlated with spam and phishing.",
            "severity": "low",
            "matched_terms": structural_flags,
        })

    return detected


def extract_indicator_features(text: str) -> Dict[str, float]:
    """
    Extracts numerical indicator features for scikit-learn models.
    """
    indicators = extract_indicators(text)
    cat_keys = set(i["category"] for i in indicators)

    total_matches = sum(len(i["matched_terms"]) for i in indicators)
    high_sev_count = sum(1 for i in indicators if i.get("severity") == "high")

    letters = [ch for ch in text if ch.isalpha()]
    upper_ratio = (sum(1 for ch in letters if ch.isupper()) / len(letters)) if letters else 0.0

    return {
        "ind_urgency": 1.0 if "urgency_pressure" in cat_keys else 0.0,
        "ind_credentials": 1.0 if "credential_harvesting" in cat_keys else 0.0,
        "ind_financial": 1.0 if "financial_bait" in cat_keys else 0.0,
        "ind_impersonation": 1.0 if "impersonation" in cat_keys else 0.0,
        "ind_cta": 1.0 if "call_to_action" in cat_keys else 0.0,
        "ind_structural": 1.0 if "structural_anomalies" in cat_keys else 0.0,
        "ind_total_matches": float(total_matches),
        "ind_high_severity": float(high_sev_count),
        "ind_upper_ratio": float(upper_ratio),
        "ind_exclamation_count": float(text.count("!")),
        "ind_currency_count": float(len(re.findall(r"[\$\£\€]", text))),
    }


def classify_phishing_type(indicators: List[Dict[str, Any]], has_url: bool = False) -> str:
    """
    Derives the dominant phishing / threat category based on detected indicators and links.
    """
    categories = {ind["category"] for ind in indicators}

    if "credential_harvesting" in categories:
        return "Credential Harvesting"
    if "impersonation" in categories and "urgency_pressure" in categories:
        return "Brand Impersonation & Urgent Coercion"
    if "impersonation" in categories:
        return "Brand or Authority Impersonation"
    if "financial_bait" in categories:
        return "Financial or Lottery Scam"
    if "urgency_pressure" in categories:
        return "Urgent Account Alert / Coercion"
    if has_url:
        return "Suspicious Link / Malicious URL"
    if "call_to_action" in categories:
        return "Unsolicited Call-to-Action / Spam"
    if indicators:
        return "General Suspicious Communication"
    return "Benign / Informational"
