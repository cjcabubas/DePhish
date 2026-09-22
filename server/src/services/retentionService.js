import { createHmac } from 'node:crypto';
import { EMAIL_PATTERN, PHONE_PATTERN, URL_PATTERN } from './artifactService.js';

export const RETENTION_VERSION = '1.0.0-minimized-artifacts';
const day = 86400000;
export const maskEmail = value => `${value[0]}***@${value.split('@').at(-1)}`;
export const maskPhone = value => `*******${value.replace(/\D/g, '').slice(-4)}`;

export function retentionPolicy(prediction, account, now = new Date()) {
  const days = prediction === 'Phishing' ? 30 : prediction === 'Suspicious' ? 7 : 0;
  return { version: RETENTION_VERSION, identifierDays: days,
    identifierExpiresAt: days ? new Date(now.getTime() + days * day) : null,
    reportExpiresAt: account ? null : new Date(now.getTime() + 30 * day),
    reportStorage: 'redacted', credentialsStored: false,
    note: 'Known secret patterns and personal identifiers are redacted before storage. Automatic detection is not exhaustive. Account history remains until deleted; guest reports expire after 30 days.' };
}

export function createRedactor(input, artifacts, { preserveContacts = false, preserveUrlPaths = false } = {}) {
  const secrets = new Set();
  // Explicitly supplied values, not phrases such as "share your password".
  for (const text of [input.original, input.normalized]) {
    for (const match of text.matchAll(/\b(?:password|passcode|pin|api[ _-]?key|access[ _-]?token|auth(?:entication)?[ _-]?token)\s*(?::|=|\bis\b)\s*["']?([^\s"',;<>]+)/gi)) secrets.add(match[1]);
    for (const match of text.matchAll(/\b(?:otp|one[- ]time (?:password|code)|verification code|security code)\s*(?:(?:is|:|=)\s*)?(\d{4,8})\b/gi)) secrets.add(match[1]);
    for (const match of text.matchAll(/\b(?:sk-[\w-]{12,}|ghp_[\w]{12,}|github_pat_[\w]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g)) secrets.add(match[0]);
    for (const match of text.matchAll(/\b(?:seed|recovery) phrase\s*(?::|=|\bis\b)\s*([^\n.!?]+)/gi)) secrets.add(match[1].trim());
    for (const match of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) secrets.add(match[0].trim());
  }
  for (const { url } of artifacts.urls) {
    try {
      const parsed = new URL(url);
      for (const value of [parsed.password, parsed.username, ...parsed.searchParams.values(), ...parsed.pathname.split('/').filter(value => value.length >= 12)]) {
        if (value.length >= 4) { secrets.add(value); try { secrets.add(decodeURIComponent(value)); } catch {} }
      }
    } catch {}
  }
  // Word-feature explanations can contain lowercased, punctuation-stripped secret fragments.
  for (const secret of [...secrets]) for (const token of secret.match(/[\p{L}\p{N}_-]{4,}/gu) || []) secrets.add(token);
  const secretValues = [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)
    .map(value => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
  function text(value) {
    // URLs in every nested field (evidence, redirects, model explanations) retain origins only.
    let out = value.normalize('NFKC').replace(/[\u200b-\u200d]/g, '')
      .replace(/hxxps?:\/\//gi, raw => /^hxxps/i.test(raw) ? 'https://' : 'http://').replace(/\[\.\]|\(dot\)/gi, '.');
    if (!preserveContacts) for (const sender of artifacts.senderCandidates) out = out.split(sender).join('[redacted sender]');
    out = out.replace(URL_PATTERN, raw => {
      try {
        const parsed = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`);
        return parsed.origin + (preserveUrlPaths && parsed.pathname !== '/' ? parsed.pathname : '');
      } catch { return '[redacted URL]'; }
    });
    for (const secret of secretValues) out = out.replace(secret, '[redacted]');
    if (!preserveContacts) out = out.replace(EMAIL_PATTERN, maskEmail).replace(PHONE_PATTERN, maskPhone);
    for (const ip of artifacts.ipAddresses) out = out.split(ip).join('[redacted IP]');
    return out;
  }
  function redact(value) {
    if (typeof value === 'string') return text(value);
    if (value instanceof Date || value == null) return value;
    if (Array.isArray(value)) return value.map(redact);
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
    return value;
  }
  return redact;
}

export function retainedIdentifiers(artifacts, policy, secret) {
  if (!policy.identifierDays) return [];
  if (!secret) throw new Error('Identifier pseudonymization key unavailable');
  const records = new Map();
  const add = (kind, canonical, value) => {
    const key = createHmac('sha256', secret).update(`${kind}:${canonical}`).digest('hex');
    records.set(key, { kind, value, key, expiresAt: policy.identifierExpiresAt, retentionVersion: policy.version });
  };
  for (const item of artifacts.urls) {
    const parsed = new URL(item.url);
    if (!['https:', 'http:'].includes(parsed.protocol) || item.is_ip) continue;
    add('url', parsed.origin, parsed.origin);
  }
  for (const email of artifacts.emails) add('email', email, maskEmail(email));
  for (const phone of artifacts.phoneNumbers) add('phone', phone, maskPhone(phone));
  return [...records.values()].slice(0, 30);
}
