import { createHash } from 'node:crypto';

export function extractIdentifiers(text, result) {
  const found = new Map();
  function add(kind, value) {
    const key = createHash('sha256').update(`${kind}:${value}`).digest('hex');
    if (!found.has(key)) found.set(key, { kind, value, key });
  }
  for (const item of result.detected_urls || []) {
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      // Keep the destination and path, excluding embedded credentials and tokens.
      url.username = ''; url.password = ''; url.search = ''; url.hash = '';
      add('url', url.href);
    } catch { /* Ignore malformed upstream URLs. */ }
  }
  for (const match of text.matchAll(/(?<![\w.+-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}(?![\w-]|\.[A-Z0-9])/gi)) {
    const value = match[0].toLowerCase();
    const [local] = value.split('@');
    if (value.length <= 254 && local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !value.includes('..')) add('email', value);
  }
  // Explicit international numbers and Philippine mobile formats only. Avoid
  // treating arbitrary OTPs, prices, transaction IDs, or bank numbers as phones.
  for (const match of text.matchAll(/(?<![\w@+])(?:\+\d[\d ()-]{6,24}\d|(?:09\d{2}|639\d{2})[ -]?\d{3}[ -]?\d{4})(?![\w\d])/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    const value = /^09\d{9}$/.test(digits) ? `+63${digits.slice(1)}` : `+${digits}`;
    add('phone', value);
  }
  return [...found.values()].slice(0, 30);
}

export async function recordPhishingIdentifiers(text, result, repository, { userId, scanId } = {}) {
  if (result.prediction !== 'Phishing') return { status: 'not_applicable', count: 0 };
  const identifiers = extractIdentifiers(text, result);
  if (!identifiers.length) return { status: 'no_identifiers', count: 0 };
  if (!repository) return { status: 'unavailable', count: 0, reason: 'Scan completed, but flagged identifiers could not be saved.' };
  try {
    await repository.record(identifiers, { userId, scanId, risk_score: result.risk_score,
      model_risk_score: result.model_risk_score, model_version: result.model_version,
      scoring_version: result.scoring_version, indicators: [...new Set((result.detected_indicators || []).map(i => i.category))].slice(0, 20) });
    return { status: 'saved', count: identifiers.length };
  } catch {
    return { status: 'unavailable', count: 0, reason: 'Scan completed, but some flagged identifiers may not have been saved.' };
  }
}
