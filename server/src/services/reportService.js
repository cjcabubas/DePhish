import { createHash } from 'node:crypto';
import { getDomain } from 'tldts';
import { normalizeInput, extractArtifacts, EMAIL_PATTERN } from './artifactService.js';
import { createRedactor } from './retentionService.js';

export const reportError = (status, message) => Object.assign(new Error(message), { status });
const digest = value => createHash('sha256').update(value).digest('hex');
const emailValid = value => new RegExp(`^(?:${EMAIL_PATTERN.source})$`, 'i').test(value) && value.length <= 254;
const phoneValid = value => /^\+\d{8,15}$/.test(value);
const validHost = value => Boolean(getDomain(value)) && value.length <= 253 && value.split('.').every(part => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(part));

export function validateReportInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw reportError(400, 'Submit a JSON report object.');
  const fields = {};
  for (const [key, max] of Object.entries({ message: 5000, suspiciousUrl: 2048, senderEmail: 254, phone: 40, details: 2000 })) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > max)) throw reportError(400, `Invalid ${key} field (maximum ${max} characters).`);
    fields[key] = (body[key] || '').trim();
  }
  if (body.sourceScanId !== undefined && !/^[a-f\d]{24}$/i.test(body.sourceScanId)) throw reportError(400, 'Invalid saved scan reference.');
  if (!body.sourceScanId && ![fields.message, fields.suspiciousUrl, fields.senderEmail, fields.phone].some(Boolean)) throw reportError(400, 'Provide a scam message, suspicious link, sender email, or phone number.');
  if (fields.senderEmail && !emailValid(fields.senderEmail)) throw reportError(400, 'Enter a valid sender email address.');
  if (fields.phone) {
    const numbers = extractArtifacts(normalizeInput(fields.phone)).phoneNumbers;
    if (!/^[+\d ()-]+$/.test(fields.phone) || numbers.length !== 1 || !phoneValid(numbers[0])) throw reportError(400, 'Enter a Philippine mobile number or an international number starting with +.');
    fields.phone = numbers[0];
  }
  if (fields.suspiciousUrl) {
    const text = normalizeInput(fields.suspiciousUrl).normalized;
    let url;
    try { url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`); } catch { /* validated below */ }
    if (!url || !['http:', 'https:'].includes(url.protocol) || /\s/.test(text) || !validHost(url.hostname)) throw reportError(400, 'Enter a valid public HTTP(S) link or domain.');
    fields.suspiciousUrl = url.href;
  }
  return fields;
}

export function analysisText(fields) {
  const text = [fields.message, fields.suspiciousUrl, fields.senderEmail ? `Sender: ${fields.senderEmail}` : '',
    fields.phone ? `Phone: ${fields.phone}` : '', fields.details].filter(Boolean).join('\n');
  if (!text.trim() || text.length > 5000) throw reportError(400, 'Keep the combined report content within 5,000 characters.');
  return text;
}

export function prepareStoredReport(fields, prepared, artifacts, analysis) {
  const redact = createRedactor(prepared, artifacts);
  // Contacts are retained only as review candidates, never as confirmed indicators.
  // Keep safe URL paths for precise review, but remove credentials, queries and fragments.
  // Known secrets and long token-like path segments are still redacted.
  const candidateRedact = createRedactor(prepared, artifacts, { preserveContacts: true, preserveUrlPaths: true });
  const safeArtifacts = extractArtifacts(normalizeInput(candidateRedact(prepared.original)));
  const candidates = new Map();
  function add(kind, value, source) {
    const check = kind === 'domain' ? `https://${value}` : value;
    if (candidateRedact(check) !== check || /\[redacted|\*/i.test(value)) return;
    const id = digest(`${kind}:${value}`);
    if (!candidates.has(id)) candidates.set(id, { id, kind, value, source });
  }
  for (const item of safeArtifacts.urls) {
    const url = new URL(item.url);
    if (!['http:', 'https:'].includes(url.protocol) || !validHost(url.hostname)) continue;
    add('url', url.origin + (url.pathname !== '/' ? url.pathname : ''), 'Detected link (credentials, query and fragment removed)');
    add('domain', url.hostname, 'Detected link hostname');
  }
  if (fields.senderEmail && safeArtifacts.emails.includes(fields.senderEmail.toLowerCase())) add('email', fields.senderEmail.toLowerCase(), 'Reporter-designated sender (may be spoofed)');
  for (const sender of safeArtifacts.senderCandidates) {
    for (const match of sender.matchAll(EMAIL_PATTERN)) add('email', match[0].toLowerCase(), 'Message sender header (may be spoofed)');
  }
  if (fields.phone && safeArtifacts.phoneNumbers.includes(fields.phone)) add('phone', fields.phone, 'Reporter-designated scam phone');
  // Message phone numbers remain candidates requiring individual review.
  for (const phone of safeArtifacts.phoneNumbers) add('phone', phone, 'Detected phone (ownership unconfirmed)');
  const content = redact(fields);
  content.suspiciousUrl = candidateRedact(fields.suspiciousUrl);
  // Preserve explicitly designated contact fields for private admin review, if safe.
  content.senderEmail = candidates.has(digest(`email:${fields.senderEmail.toLowerCase()}`)) ? fields.senderEmail.toLowerCase() : content.senderEmail;
  content.phone = candidates.has(digest(`phone:${fields.phone}`)) ? fields.phone : content.phone;
  return { content, analysis: redact(analysis), candidates: [...candidates.values()].slice(0, 50) };
}

export function reviewDecision(report, body = {}) {
  if (!['pending', 'verified', 'rejected'].includes(body.status)) throw reportError(400, 'Choose Pending, Verified, or Rejected.');
  if (!Number.isInteger(body.revision) || body.revision < 0) throw reportError(400, 'A report revision is required. Refresh the report.');
  if (typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 1000) throw reportError(400, 'Add a review note between 5 and 1,000 characters.');
  if (!Array.isArray(body.indicatorIds) || body.indicatorIds.length > 50 || body.indicatorIds.some(id => typeof id !== 'string')) throw reportError(400, 'Choose indicators from this report.');
  if (body.status !== 'verified' && body.indicatorIds.length) throw reportError(400, 'Only verified reports can publish indicators.');
  const indicators = [...new Set(body.indicatorIds)].map(id => report.candidates.find(item => item.id === id));
  if (indicators.some(item => !item || !['url', 'domain', 'email', 'phone'].includes(item.kind))) throw reportError(400, 'An indicator is not a valid candidate on this report.');
  if (indicators.some(item => item.kind === 'email') && body.emailReviewed !== true) throw reportError(400, 'Confirm that selected sender emails were reviewed for spoofing.');
  const prepared = normalizeInput(body.note);
  const note = createRedactor(prepared, extractArtifacts(prepared))(body.note.trim());
  return { status: body.status, indicators, note, emailReviewed: indicators.some(item => item.kind === 'email') && body.emailReviewed === true };
}
