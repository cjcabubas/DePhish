"""
url_features.py - Extracts lexical and structural URL indicators from text for phishing detection.
"""

import re
from urllib.parse import urlparse
from typing import List, Dict, Any

URL_REGEX = re.compile(
    r"(?:https?://|ftp://|www\.)[^\s/$.?#].[^\s]*|"
    r"(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|me|biz|info|xyz|top|site|club|vip|online|click|loan|zip|work|cc|tk|ml|ga|cf|gq)(?:/[^\s]*)?",
    re.IGNORECASE
)

IP_REGEX = re.compile(r"^https?://(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:/.*)?$", re.IGNORECASE)

KNOWN_SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "t.co",
    "tiny.cc", "rb.gy", "cutt.ly", "adf.ly", "bit.do", "bl.ink", "shorturl.at"
}

SUSPICIOUS_TLDS = {
    "xyz", "top", "work", "loan", "click", "country", "kim", "cricket",
    "science", "party", "gq", "cf", "tk", "ml", "ga", "zip", "mov"
}


def extract_urls(text: str) -> List[str]:
    """Finds all URL candidates in a text."""
    if not text:
        return []
    matches = URL_REGEX.findall(text)
    # Filter out common trailing punctuations
    cleaned = []
    for m in matches:
        m = m.rstrip(".,;:)>]\"'")
        if m:
            cleaned.append(m)
    return cleaned


def analyze_url(url: str) -> Dict[str, Any]:
    """Analyzes a single URL for phishing indicators."""
    normalized = url if url.startswith(("http://", "https://", "ftp://")) else "http://" + url
    hostname = ""
    path = ""
    try:
        parsed = urlparse(normalized)
        hostname = (parsed.hostname or "").lower()
        path = parsed.path or ""
    except Exception:
        # Fallback for malformed URLs (e.g. invalid IPv6 brackets)
        match = re.search(r"://([^/:\s]+)", normalized)
        if match:
            hostname = match.group(1).lower().strip("[]")
        path = ""

    is_ip = bool(IP_REGEX.match(normalized)) or bool(re.match(r"^(\d{1,3}\.){3}\d{1,3}$", hostname))
    has_at = "@" in normalized
    has_hyphen = "-" in hostname
    is_shortener = hostname in KNOWN_SHORTENERS

    # Check TLD
    tld = hostname.split(".")[-1] if "." in hostname else ""
    is_suspicious_tld = tld in SUSPICIOUS_TLDS

    # Check subdomains
    dots = hostname.count(".")
    excessive_subdomains = dots >= 3

    # Check double slash in path (redirect tricks)
    has_double_slash_path = "//" in path

    return {
        "url": url,
        "hostname": hostname,
        "is_ip": is_ip,
        "has_at_symbol": has_at,
        "has_hyphen": has_hyphen,
        "is_shortener": is_shortener,
        "is_suspicious_tld": is_suspicious_tld,
        "excessive_subdomains": excessive_subdomains,
        "has_double_slash_path": has_double_slash_path,
        "length": len(url),
    }


def extract_url_feature_dict(text: str) -> Dict[str, float]:
    """
    Extracts aggregated numerical URL features from a message for the ML pipeline.
    """
    urls = extract_urls(text)[:20]
    if not urls:
        return {
            "url_count": 0.0,
            "has_url": 0.0,
            "has_ip_url": 0.0,
            "has_at_symbol": 0.0,
            "has_shortener": 0.0,
            "suspicious_tld_count": 0.0,
            "max_url_length": 0.0,
            "excessive_subdomains": 0.0,
        }

    analyses = [analyze_url(u) for u in urls]
    return {
        "url_count": float(len(urls)),
        "has_url": 1.0,
        "has_ip_url": float(any(a["is_ip"] for a in analyses)),
        "has_at_symbol": float(any(a["has_at_symbol"] for a in analyses)),
        "has_shortener": float(any(a["is_shortener"] for a in analyses)),
        "suspicious_tld_count": float(sum(1 for a in analyses if a["is_suspicious_tld"])),
        "max_url_length": float(max(a["length"] for a in analyses)),
        "excessive_subdomains": float(any(a["excessive_subdomains"] for a in analyses)),
    }
