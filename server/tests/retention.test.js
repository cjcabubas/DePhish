import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, extractArtifacts } from '../src/services/artifactService.js';
import { createRedactor, retentionPolicy, retainedIdentifiers } from '../src/services/retentionService.js';
import { persistScan } from '../src/services/scanPersistenceService.js';

test('known secrets and identifiers are redacted across messages and nested report fields', () => {
  const prepared = normalizeInput('Email Jane@Example.com, phone 0917-555-0182. OTP 719281. password: SeCrEt987! api_key=sk-abcdefghijklmnopqrstuvwxyz https://example.com/Reset/LongSecretValue123?token=privatevalue#719281');
  const artifacts = extractArtifacts(prepared);
  const redact = createRedactor(prepared, artifacts);
  const raw = { message: prepared.original, evidence: [{ context: prepared.original, text: '719281' }],
    model_explanation: { toward_phishing: [{ term: 'secret987' }] }, urls: artifacts.urls };
  const stored = JSON.stringify(redact(raw));
  for (const secret of ['719281', 'SeCrEt987!', 'secret987', 'abcdefghijklmnopqrstuvwxyz', 'privatevalue', 'LongSecretValue123', 'Jane@Example.com', '0917-555-0182']) assert.equal(stored.includes(secret), false, secret);
  assert.equal(raw.message, prepared.original);
  assert.ok(stored.includes('***@Example.com'));
  assert.ok(stored.includes('https://example.com'));
});

test('storage policy discards legitimate identifiers and bounds suspicious/phishing retention', () => {
  const now = new Date('2026-09-20T00:00:00Z');
  const artifacts = extractArtifacts(normalizeInput('a@example.com 09175550182 https://example.com/reset?token=abc'));
  const legitimate = retentionPolicy('Legitimate', true, now);
  assert.deepEqual(retainedIdentifiers(artifacts, legitimate), []);
  assert.equal(legitimate.reportExpiresAt, null);
  for (const [prediction, days] of [['Suspicious', 7], ['Phishing', 30]]) {
    const policy = retentionPolicy(prediction, false, now);
    assert.equal((policy.identifierExpiresAt - now) / 86400000, days);
    assert.equal((policy.reportExpiresAt - now) / 86400000, 30);
    const records = retainedIdentifiers(artifacts, policy, 'test-pseudonymization-key');
    assert.deepEqual(records.map(row => row.value), ['https://example.com', 'a***@example.com', '*******0182']);
    assert.notEqual(records[0].key, retainedIdentifiers(artifacts, policy, 'different-key')[0].key);
    assert.ok(records.every(row => row.expiresAt === policy.identifierExpiresAt));
  }
});

test('ordinary scans never publish threat indicators; saved history is redacted even when storage fails', async () => {
  const prepared = normalizeInput('OTP 719281. Contact person@example.com');
  const artifacts = extractArtifacts(prepared);
  let stored, records;
  const result = await persistScan({ prepared, artifacts, consent: { _id: 'consent1' },
    report: { prediction: 'Suspicious', risk_score: 50, detected_indicators: [{ category: 'secret_disclosure', evidence: [{ text: '719281' }] }] },
    scans: { create: async fields => { stored = fields; throw new Error('private'); } },
    identifiers: { record: async fields => { records = fields; } }, pseudonymizationKey: 'test-key' });
  assert.equal(result.persistence.status, 'unavailable');
  assert.equal(result.identifier_registry.status, 'not_applicable');
  assert.equal(stored.consentId, 'consent1');
  assert.ok(!JSON.stringify(stored).includes('719281'));
  assert.ok(!JSON.stringify(stored).includes('person@example.com'));
  assert.equal(records, undefined);
});
