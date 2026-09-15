"""Detailed observations, separate from the frozen model's training features."""
import re


GUIDANCE = {
    'urgency_pressure': (
        'A deadline or account threat can pressure you to skip independent verification.',
        'Genuine security alerts can also be urgent; urgency does not authenticate the sender.',
        'Check the alert in the official app or contact the organization using a known number.'),
    'credential_harvesting': (
        'An account or identity request could lead to disclosure of credentials or personal information.',
        'A password reset you initiated can be legitimate. The message alone cannot establish that context.',
        'Open the official app yourself. Do not enter credentials through the message’s link.'),
    'financial_bait': (
        'Rewards or financial promises can create an incentive to pay fees or disclose information.',
        'Refunds, promotions, and financial terminology also appear in legitimate messages.',
        'Verify the offer independently before paying or submitting personal information.'),
    'impersonation': (
        'An organization or authority is invoked to make the request appear trustworthy.',
        'Mentioning a brand is not evidence of impersonation; sender identity is not verified.',
        'Compare the request with an official channel rather than trusting the displayed name.'),
    'call_to_action': (
        'The message asks you to move from reading to clicking, calling, or opening content.',
        'These actions are common in legitimate messages; the destination and context matter.',
        'Check the destination independently and confirm unexpected attachments with the sender.'),
    'structural_anomalies': (
        'Formatting or contact details may reinforce a sales pitch or pressure tactic.',
        'Capitalization, punctuation, and phone numbers are weak signals and occur in ordinary messages.',
        'Judge the request and sender context rather than the formatting alone.'),
}

# New rules affect the explanation layer only. Changing trained dense features
# without retraining would silently change the serialized model's input semantics.
RULES = [
    ('secret_disclosure', 'Request to disclose a security secret', 'high',
     [r'\b(?:send|share|reply\s+with|give|provide|tell\s+us|enter)\s+(?:(?:us|me)\s+)?(?:your\s+|the\s+)?(?:otp|one[- ]time\s+(?:password|code)|verification\s+code|security\s+code|password|pin|recovery\s+phrase|seed\s+phrase)\b',
      r'\b(?:ibigay|isend|i-send|ipadala)\s+(?:mo\s+)?(?:ang\s+|iyong\s+|yung\s+)?(?:otp|password|pin|code)\b'],
     'Sharing an OTP, password, or recovery phrase can let someone access an account or authorize a transaction.',
     'Entering a code in an official app you opened yourself differs from sending it to another person.',
     'Do not send the secret. Verify the request through the official app or a known contact.'),
    ('payment_redirection', 'Payment or bank-detail change', 'high',
     [r'\b(?:new|updated|changed)\s+(?:bank\s+|payment\s+)?(?:account\s+details|bank\s+details|payment\s+details|bank\s+account)\b',
      r'\b(?:pay|send|transfer|wire)\s+(?:the\s+|your\s+)?(?:money|payment|funds)\s+to\b',
      r'\b(?:pay|send|buy|purchase)\b[^.!?\n]{0,45}\b(?:gift\s+cards?|processing\s+fee|release\s+fee)\b'],
     'A changed payment destination or unusual payment method can divert money to another recipient.',
     'Bank changes and fees can be legitimate. The message does not verify the payee or account owner.',
     'Confirm payment details using an existing trusted phone number before sending money.'),
    ('remote_access', 'Remote-access or software-install request', 'high',
     [r'\b(?:install|download|open|run)\s+(?:the\s+)?(?:anydesk|teamviewer|remote\s+desktop|remote\s+access)\b',
      r'\b(?:grant|allow|enable|give\s+us)\s+(?:us\s+)?(?:remote\s+access|control\s+of\s+your\s+(?:computer|device))\b'],
     'Remote-control tools can expose your files, banking session, and device to another person.',
     'A support session you requested may use these tools; unsolicited requests need independent verification.',
     'Confirm the support agent through a known channel before installing software or granting access.'),
    ('security_bypass', 'Request to bypass security or keep the action secret', 'high',
     [r'\b(?:disable|turn\s+off)\s+(?:your\s+)?(?:antivirus|security\s+software|two[- ]factor\s+authentication|2fa)\b',
      r'\b(?:enable|allow)\s+(?:the\s+)?macros\b',
      r'\b(?:do\s+not|don.t)\s+(?:tell|contact|inform)\s+(?:anyone|your\s+bank|the\s+bank|your\s+manager)\b'],
     'Bypassing protections or independent contacts removes safeguards against fraud and malicious files.',
     'Quoted warnings or security training may describe these instructions without asking you to follow them.',
     'Keep protections enabled and independently confirm the request before proceeding.'),
]


def _evidence(text, match):
    start, end = match.span()
    return {'text': text[start:end], 'start': start, 'end': end,
            'context': text[max(0, start-65):min(len(text), end+65)]}


def _negated(text, match):
    # A direct warning such as "never share your OTP" is not a request to disclose it.
    return bool(re.search(r"(?:do\s+not|don't|don’t|never|huwag)\s+(?:ever\s+)?$",
                          text[max(0, match.start()-35):match.start()], re.IGNORECASE))


def detailed_indicators(text, base_indicators, base_patterns):
    result = []
    for item in base_indicators:
        why, caveat, action = GUIDANCE[item['category']]
        evidence = []
        seen = set()
        for pattern in base_patterns.get(item['category'], {}).get('patterns', []):
            for match in re.finditer(pattern, text, re.IGNORECASE):
                if match.span() not in seen:
                    evidence.append(_evidence(text, match))
                    seen.add(match.span())
        title = 'Claimed brand or authority' if item['category'] == 'impersonation' else item['title']
        result.append({**item, 'title': title, 'why_it_matters': why, 'benign_context': caveat,
                       'recommended_action': action, 'evidence': evidence[:5],
                       'source': 'observed_pattern'})
    for category, title, severity, patterns, why, caveat, action in RULES:
        matches = {m.span(): m for p in patterns for m in re.finditer(p, text, re.IGNORECASE)
                   if not _negated(text, m)}
        if matches:
            evidence = [_evidence(text, m) for _, m in sorted(matches.items())][:5]
            result.append({'category': category, 'title': title, 'severity': severity,
                           'description': 'The message contains a specific request worth verifying.',
                           'matched_terms': list(dict.fromkeys(e['text'] for e in evidence)),
                           'evidence': evidence, 'why_it_matters': why,
                           'benign_context': caveat, 'recommended_action': action,
                           'source': 'observed_pattern'})
    if re.search(r'[\u200b-\u200d\uff01-\uff5e]|hxxps?://|\[\.\]|\(dot\)', text, re.IGNORECASE):
        result.append({'category': 'text_obfuscation', 'title': 'Obfuscated or unusual text encoding',
                       'severity': 'low', 'description': 'Invisible characters, full-width text, or defanged links were found.',
                       'matched_terms': [], 'evidence': [], 'source': 'observed_pattern',
                       'why_it_matters': 'These formats can disguise text or links. The v2 model normalizes them before classification.',
                       'benign_context': 'Defanged links are also common in security reports; unusual encoding alone does not establish intent.',
                       'recommended_action': 'Read the actual destination carefully. Do not reconstruct and open an unfamiliar link.'})
    return result
