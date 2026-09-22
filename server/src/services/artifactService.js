import { isIP } from 'node:net';
import { getDomain } from 'tldts';

// Preserve case and original text for formatting evidence and case-sensitive URL paths.
export function normalizeInput(original) {
  return { original, normalized: original.normalize('NFKC').replace(/[\u200b-\u200d]/g, '')
    .replace(/hxxps?:\/\//gi, value => /^hxxps/i.test(value) ? 'https://' : 'http://')
    .replace(/\[\.\]|\(dot\)/gi, '.').replace(/\s+/g, ' ').trim() };
}

export const EMAIL_PATTERN = /(?<![\w.+-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}(?![\w-]|\.[A-Z0-9])/gi;
export const PHONE_PATTERN = /(?<![\w@+])(?:\+\d[\d ()-]{6,24}\d|(?:09\d{2}|639\d{2})[ -]?\d{3}[ -]?\d{4})(?![\w\d])/g;
export const URL_PATTERN = /(?:https?|ftp):\/\/[^\s<>"']+|(?<![\w@./-])(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#][^\s<>"']*)?/gi;
const shorteners = new Set(['bit.ly','tinyurl.com','goo.gl','ow.ly','is.gd','buff.ly','t.co','tiny.cc','rb.gy','cutt.ly','adf.ly','bit.do','bl.ink','shorturl.at']);
const warningTlds = new Set(['xyz','top','work','loan','click','country','kim','cricket','science','party','gq','cf','tk','ml','ga','zip','mov']);

export function describeUrl(value) {
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(value) ? value : `http://${value}`);
    if (!['http:', 'https:', 'ftp:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase();
    return { url: parsed.href, hostname, is_ip: Boolean(isIP(hostname.replace(/^\[|\]$/g, ''))),
      has_at_symbol: parsed.href.includes('@'), has_hyphen: hostname.includes('-'),
      is_shortener: shorteners.has(hostname), is_suspicious_tld: warningTlds.has(hostname.split('.').at(-1)),
      excessive_subdomains: hostname.split('.').length >= 4, has_double_slash_path: parsed.pathname.includes('//'), length: parsed.href.length };
  } catch { return null; }
}

export function extractArtifacts({ original, normalized }) {
  const urls = [...new Map([...normalized.matchAll(URL_PATTERN)].map(match => describeUrl(match[0].replace(/[.,;:)>\]}]+$/, '')))
    .filter(Boolean).map(item => [item.url, item])).values()];
  const emails = [...new Set([...normalized.matchAll(EMAIL_PATTERN)].map(match => match[0].toLowerCase()))];
  const phoneNumbers = [...new Set([...normalized.matchAll(PHONE_PATTERN)].map(match => {
    const digits = match[0].replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? (/^09\d{9}$/.test(digits) ? `+63${digits.slice(1)}` : `+${digits}`) : null;
  }).filter(Boolean))];
  const ipAddresses = [...new Set([...normalized.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[\da-f]{0,4}(?::[\da-f]{0,4}){2,7}\b/gi)]
    .map(match => match[0]).filter(value => isIP(value)))];
  const credentials = { passwordDetected: /\b(?:password|passcode|recovery phrase|seed phrase)\b/i.test(normalized),
    otpDetected: /\botp\b|one[- ]time (?:password|code)|verification code/i.test(normalized),
    apiKeyDetected: /\bapi[ _-]?key\b|\b(?:sk|ghp|github_pat)[_-][\w-]{12,}/i.test(normalized) };
  return { urls, domains: [...new Set(urls.map(item => getDomain(item.hostname) || item.hostname))], emails, phoneNumbers,
    ipAddresses, credentials, senderCandidates: [...original.matchAll(/^\s*(?:from|sender):\s*(.+)$/gim)].map(match => match[1].slice(0, 254)).slice(0, 5) };
}

export function detectMessageType(input, artifacts, requested = 'auto') {
  if (requested !== 'auto') return { type: requested, basis: 'user_supplied' };
  const direct = describeUrl(input.normalized);
  if (artifacts.urls.length === 1 && direct?.url === artifacts.urls[0].url && !/\s/.test(input.normalized)) return { type: 'url', basis: 'single_url' };
  if (/^\s*(?:from|to|subject|date):/im.test(input.original) || /\n\s*\n/.test(input.original)) return { type: 'email', basis: 'email_structure' };
  if (input.normalized.length <= 160 && !/[\r\n]/.test(input.original)) return { type: 'sms', basis: 'short_single_line_heuristic' };
  return { type: 'unknown', basis: 'insufficient_structure' };
}

export function analyzeEntities(artifacts) {
  return { status: 'complete', urlsDetected: artifacts.urls.length, domainsDetected: artifacts.domains.length,
    emailsDetected: artifacts.emails.length, phonesDetected: artifacts.phoneNumbers.length, ipAddressesDetected: artifacts.ipAddresses.length,
    senderCandidatesDetected: artifacts.senderCandidates.length, credentials: artifacts.credentials,
    credentialsDetected: Object.values(artifacts.credentials).some(Boolean),
    note: 'Credential flags identify mentions or patterns, not verified secrets. Sender candidates are not authenticated.' };
}
