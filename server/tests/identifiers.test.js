import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { extractIdentifiers, recordPhishingIdentifiers } from '../src/services/identifierService.js';
import { createIdentifierRepository } from '../src/models/FlaggedIdentifier.js';
import { scanController } from '../src/controllers/scanController.js';

test('extracts and deduplicates destinations, email addresses, and formatted mobile numbers', () => {
  const text = 'Contact Support@EXAMPLE.com. Or support@example.com; call 0917-555-0182 or +63 917 555 0182. OTP 123456, account 123456789012, total 10000.';
  const result = { detected_urls: [{ url: 'https://user:secret@EXAMPLE.com/login?token=private#code' }, { url: 'https://example.com/login?a=1' }, { url: 'javascript:alert(1)' }, { url: 'invalid' }] };
  const found = extractIdentifiers(text, result);
  assert.deepEqual(found.map(i => [i.kind, i.value]), [['url', 'https://example.com/login'], ['email', 'support@example.com'], ['phone', '+639175550182']]);
  assert.equal(new Set(found.map(i => i.key)).size, 3);
});

test('only final Phishing verdicts write, including anonymous scans; failures preserve results', async () => {
  let writes = 0, evidence;
  const repository = { record: async (identifiers, input) => { writes++; evidence = input; assert.equal(identifiers[0].value, 'support@example.com'); } };
  for (const prediction of ['Suspicious', 'Legitimate']) assert.equal((await recordPhishingIdentifiers('support@example.com', { prediction }, repository)).status, 'not_applicable');
  assert.equal(writes, 0);
  const result = { prediction: 'Phishing', risk_score: 91, model_risk_score: 71, detected_indicators: [{ category: 'urgency_pressure' }] };
  assert.equal((await recordPhishingIdentifiers('support@example.com', result, repository)).status, 'saved');
  assert.equal(evidence.userId, undefined);
  assert.equal(evidence.risk_score, 91);
  assert.equal('text' in evidence, false);
  assert.equal((await recordPhishingIdentifiers('no identifiers', result, repository)).status, 'no_identifiers');
  assert.equal((await recordPhishingIdentifiers('support@example.com', result)).status, 'unavailable');
  const failed = await recordPhishingIdentifiers('support@example.com', result, { record: async () => { throw new Error('secret connection string'); } });
  assert.equal(failed.status, 'unavailable'); assert.ok(!JSON.stringify(failed).includes('secret connection'));
});

test('repository uses unique atomic upserts and retains reviewed status on repeat detection', async () => {
  const repository = createIdentifierRepository();
  const Model = mongoose.models.FlaggedIdentifier;
  assert.ok(Model.schema.indexes().some(([keys, options]) => keys.key === 1 && options.unique));
  const original = Model.updateOne;
  const calls = [];
  Model.updateOne = async (filter, update, options) => { calls.push({ filter, update, options }); if (calls.length === 1) throw Object.assign(new Error(), { code: 11000 }); };
  try {
    await repository.record([{ key: 'unique-key', kind: 'email', value: 'support@example.com' }], { risk_score: 91 });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.upsert, true);
    assert.equal(calls[0].update.$setOnInsert.status, 'scanner_flagged');
    assert.equal(calls[1].update.$inc.detections, 1);
    assert.equal('status' in calls[1].update.$set, false);
  } finally { Model.updateOne = original; }
});

test('controller records identifiers even when private scan history fails', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ prediction: 'Phishing', risk_score: 90, detected_urls: [], detected_indicators: [] }) });
  let recorded, output;
  try {
    await scanController('http://localhost:8000', { create: async () => { throw new Error(); } }, { record: async (identifiers, evidence) => { recorded = evidence; } })({ body: { text: 'Contact phish@example.com.' }, user: { _id: '000000000000000000000001' } }, { json: value => { output = value; }, status() { return this; } });
    assert.equal(recorded.userId, '000000000000000000000001');
    assert.equal(output.prediction, 'Phishing');
    assert.equal(output.persistence.status, 'unavailable');
    assert.equal(output.identifier_registry.status, 'saved');
  } finally { globalThis.fetch = original; }
});
