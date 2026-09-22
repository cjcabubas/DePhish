import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { normalizeInput, extractArtifacts } from '../src/services/artifactService.js';
import { validateReportInput, analysisText, prepareStoredReport, reviewDecision } from '../src/services/reportService.js';
import { SCAN_TERMS } from '../../client/src/data/scanTerms.js';

const consent = { tosAccepted: true, termsVersion: SCAN_TERMS.version };
const sourceId = 'a'.repeat(24);
const analysis = { risk_score: 82, prediction: 'Phishing', phishing_type: 'Credential harvesting', detected_indicators: [], detected_urls: [] };

async function setup(t) {
  const accounts = new Map(), records = new Map(), threats = new Map();
  let analyzed = [], scanWrites = 0, consentWrites = 0;
  const users = { create: async fields => {
    const user = { ...fields, _id: String(accounts.size + 1).padStart(24, '0') }; accounts.set(user._id, user); return user;
  }, findById: async id => accounts.get(id), findByEmail: async email => [...accounts.values()].find(user => user.email === email) };
  const reports = {
    create: async fields => { const report = { ...fields, _id: String(records.size + 10).padStart(24, '0'), createdAt: new Date() }; records.set(report._id, report); return report; },
    find: async id => records.get(id),
    list: async ({ userId, status, page }) => {
      const rows = [...records.values()].filter(row => !userId || row.userId === userId);
      const filtered = rows.filter(row => !status || row.status === status);
      return { reports: filtered, total: filtered.length, page, counts: Object.fromEntries(['pending','verified','rejected'].map(status => [status, rows.filter(row => row.status === status).length])) };
    },
    review: async (id, revision, decision, reviewer) => {
      const report = records.get(id);
      if (!report || report.revision !== revision) return null;
      Object.assign(report, { status: decision.status, revision: revision + 1, reviewNote: decision.note, reviewedBy: reviewer,
        approvedIndicatorIds: decision.indicators.map(item => item.id) });
      threats.set(id, decision.indicators);
      return report;
    },
    threats: async page => ({ page, indicators: [...threats.values()].flat(), total: [...threats.values()].flat().length }),
  };
  const store = new session.MemoryStore();
  const app = createApp({ config: { sessionSecret: 'test-only-secret-at-least-32-characters', origins: ['http://localhost:5173'] },
    users, store, reports,
    consents: { create: async fields => { consentWrites++; return { ...fields, _id: 'b'.repeat(24) }; } },
    scans: { create: async () => { scanWrites++; }, findOwned: async (id, owner) => id === sourceId && owner === '1'.padStart(24, '0') ? { message: 'Stored scan content' } : null },
    reportAnalyze: async ({ text }) => {
      analyzed.push(text);
      if (text === 'offline') throw new Error('private ML failure');
      const prepared = normalizeInput(text), artifacts = extractArtifacts(prepared);
      return { report: { ...analysis, detected_indicators: [{ category: 'credential_harvesting', evidence: [{ text }] }] }, prepared, artifacts };
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { store.clear(() => {}); server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, cookie, method = body ? 'POST' : 'GET', headers = {}) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const signup = async (email, admin = false) => {
    const response = await request('/api/auth/signup', { name: 'Reviewer', email, password: 'test-password-1234' });
    assert.equal(response.status, 201);
    const { user } = await response.json();
    if (admin) accounts.get(user.id).role = 'admin';
    return response.headers.getSetCookie().find(value => value.includes('Path=/api;')).split(';')[0];
  };
  return { request, signup, records, threats, analyzed, stats: () => ({ scanWrites, consentWrites }) };
}

test('manual report is analyzed, saved pending and redacted without creating history or indicators', async t => {
  const app = await setup(t);
  const response = await app.request('/api/reports', { ...consent, message: 'Urgent password: PrivateSecret987! OTP 719281',
    suspiciousUrl: 'https://scam.example.com/login?token=hidden-token', senderEmail: 'fraud@example.com', phone: '09175550182', details: 'Unexpected account request', status: 'verified' });
  assert.equal(response.status, 201);
  const { report } = await response.json();
  assert.equal(report.status, 'pending'); assert.equal(report.analysis.risk_score, 82);
  assert.equal(report.analysis.phishing_type, 'Credential harvesting');
  assert.equal(report.userId, null); assert.equal(app.analyzed.length, 1);
  assert.equal(app.stats().scanWrites, 0); assert.equal(app.stats().consentWrites, 1); assert.equal(app.threats.size, 0);
  const stored = JSON.stringify(report);
  for (const value of ['PrivateSecret987', '719281', 'hidden-token']) assert.equal(stored.includes(value), false, value);
  assert.ok(report.candidates.some(item => item.kind === 'url' && item.value === 'https://scam.example.com/login'));
  assert.ok(report.candidates.some(item => item.kind === 'email' && item.value === 'fraud@example.com'));
  assert.ok(report.candidates.some(item => item.kind === 'phone' && item.value === '+639175550182'));
  assert.ok(report.candidates.some(item => item.kind === 'domain' && item.value === 'scam.example.com'));
});

test('admin decisions publish selected indicators only, require email review, and retract on rejection/reopening', async t => {
  const app = await setup(t);
  const owner = await app.signup('owner@example.com');
  const admin = await app.signup('admin@example.com', true);
  const { report } = await (await app.request('/api/reports', { ...consent, senderEmail: 'scammer@example.com', suspiciousUrl: 'https://scam.example.com' }, owner)).json();
  const email = report.candidates.find(item => item.kind === 'email'), url = report.candidates.find(item => item.kind === 'url');
  const decision = { status: 'verified', revision: 0, indicatorIds: [email.id], note: 'Sender independently confirmed.' };
  assert.equal((await app.request(`/api/reports/${report._id}/status`, decision, owner, 'PATCH')).status, 403);
  assert.equal((await app.request(`/api/reports/${report._id}/status`, decision, undefined, 'PATCH')).status, 401);
  assert.equal((await app.request(`/api/reports/${report._id}/status`, decision, admin, 'PATCH')).status, 400);
  assert.equal(app.threats.size, 0);
  const response = await app.request(`/api/reports/${report._id}/status`, { ...decision, emailReviewed: true }, admin, 'PATCH');
  assert.equal(response.status, 200);
  assert.deepEqual(app.threats.get(report._id).map(item => item.id), [email.id]);
  assert.equal((await app.request(`/api/reports/${report._id}/status`, { ...decision, emailReviewed: true }, admin, 'PATCH')).status, 409);
  assert.equal((await app.request(`/api/reports/${report._id}/status`, { ...decision, revision: 1, status: 'rejected', indicatorIds: [] }, admin, 'PATCH')).status, 200);
  assert.equal(app.threats.get(report._id).length, 0);
  assert.equal((await app.request(`/api/reports/${report._id}/status`, { ...decision, revision: 2, indicatorIds: [url.id] }, admin, 'PATCH')).status, 200);
  assert.deepEqual(app.threats.get(report._id).map(item => item.id), [url.id]);
  assert.equal((await app.request(`/api/reports/${report._id}/status`, { ...decision, revision: 3, status: 'pending', indicatorIds: [] }, admin, 'PATCH')).status, 200);
  assert.equal(app.threats.get(report._id).length, 0);
});

test('report lists are private, admin views protected, and saved scan ownership is checked server-side', async t => {
  const app = await setup(t), owner = await app.signup('owner@example.com'), other = await app.signup('other@example.com');
  assert.equal((await app.request('/api/reports')).status, 401);
  assert.equal((await app.request('/api/reports/admin', undefined, owner)).status, 403);
  assert.equal((await app.request('/api/reports/threat-indicators', undefined, other)).status, 403);
  assert.equal((await app.request('/api/reports', { ...consent, sourceScanId: sourceId })).status, 401);
  assert.equal((await app.request('/api/reports', { ...consent, sourceScanId: sourceId }, other)).status, 404);
  const response = await app.request('/api/reports', { ...consent, sourceScanId: sourceId, message: 'Forged content', userId: 'forged' }, owner);
  assert.equal(response.status, 201);
  assert.equal(app.analyzed[0], 'Stored scan content');
  assert.equal((await (await app.request('/api/reports', undefined, owner)).json()).total, 1);
  assert.equal((await (await app.request('/api/reports', undefined, other)).json()).total, 0);
});

test('invalid consent, hostile origins and scanner failure never save reports', async t => {
  const app = await setup(t);
  for (const [body, expected] of [[{ message: 'hello' }, 400], [{ ...consent, termsVersion: 'old', message: 'hello' }, 409], [{ ...consent, message: 'offline' }, 503]]) {
    const response = await app.request('/api/reports', body);
    assert.equal(response.status, expected); assert.equal((await response.text()).includes('private ML'), false);
  }
  assert.equal((await app.request('/api/reports', { ...consent, message: 'Hello' }, undefined, 'POST', { Origin: 'https://hostile.example' })).status, 403);
  assert.equal(app.records.size, 0); assert.equal(app.analyzed.length, 1);
});

test('validation excludes malformed contacts, excessive input and arbitrary review indicators', () => {
  for (const body of [{}, { details: 'details only' }, { message: 'a'.repeat(5001) }, { senderEmail: 'bad' }, { phone: '1234' },
    { suspiciousUrl: 'javascript:alert(1)' }, { suspiciousUrl: 'https://localhost' }, { message: 'ok', sourceScanId: {} }]) assert.throws(() => validateReportInput(body));
  assert.throws(() => analysisText({ message: 'a'.repeat(4900), details: 'b'.repeat(200) }));
  assert.throws(() => reviewDecision({ candidates: [] }, { status: 'verified', revision: 0, note: 'reviewed', indicatorIds: ['invented'] }));
  assert.throws(() => reviewDecision({ candidates: [] }, { status: 'rejected', revision: 0, note: 'reviewed', indicatorIds: ['password'] }));
});

test('credentials and recipient addresses cannot become threat candidates; secret phone normalization cannot bypass redaction', () => {
  const fields = validateReportInput({ message: 'To: innocent@example.com\nFrom: fraud@example.com\npassword: 09175550182\nOTP 719281\nhttps://scam.example.com/path?phone=09175550182', details: '' });
  const prepared = normalizeInput(analysisText(fields));
  const result = prepareStoredReport(fields, prepared, extractArtifacts(prepared), analysis);
  assert.equal(result.candidates.some(item => item.kind === 'phone'), false);
  assert.equal(result.candidates.some(item => item.value === 'innocent@example.com'), false);
  assert.equal(result.candidates.some(item => item.value === 'fraud@example.com'), true);
  assert.equal(result.candidates.some(item => /password|credential|otp/.test(item.kind)), false);
});

test('URL candidates retain useful paths but exclude tokens, embedded credentials and credential-like paths', () => {
  const fields = validateReportInput({ message: 'https://user:SecretPass@example.com/login?token=privateToken#fragmentSecret https://example.net/reset/LongSecretPath12345' });
  const prepared = normalizeInput(analysisText(fields));
  const stored = prepareStoredReport(fields, prepared, extractArtifacts(prepared), analysis);
  assert.ok(stored.candidates.some(item => item.kind === 'url' && item.value === 'https://example.com/login'));
  assert.equal(stored.candidates.some(item => item.kind === 'url' && item.value.includes('example.net')), false);
  for (const value of ['SecretPass', 'privateToken', 'fragmentSecret', 'LongSecretPath12345']) assert.equal(JSON.stringify(stored).includes(value), false);
});
