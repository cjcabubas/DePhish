import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { scanController } from '../src/controllers/scanController.js';
import { SCAN_TERMS } from '../../client/src/data/scanTerms.js';

test('missing, false, forged, and stale consent never reach storage or analysis', async () => {
  let writes = 0;
  const controller = scanController('http://localhost:8000', undefined, undefined, { create() { writes++; } });
  for (const [fields, expected] of [[{}, 400], [{ tosAccepted: false }, 400], [{ tosAccepted: 'true' }, 400], [{ tosAccepted: true }, 409], [{ tosAccepted: true, termsVersion: 'old' }, 409]]) {
    let status;
    await controller({ body: { text: 'hello', ...fields } }, { status(value) { status = value; return this; }, json() {} });
    assert.equal(status, expected);
  }
  assert.equal(writes, 0);
});

test('consent storage failure blocks all analysis and hides internal errors', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; };
  try {
    for (const repository of [undefined, { create() { throw new Error('private connection string'); } }]) {
      let status, body;
      await scanController('http://localhost:8000', undefined, undefined, repository)(
        { body: { text: 'hello', tosAccepted: true, termsVersion: SCAN_TERMS.version } },
        { status(value) { status = value; return this; }, json(value) { body = value; } });
      assert.equal(status, 503);
      assert.match(body.message, /No scan was performed/);
      assert.ok(!body.message.includes('private'));
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('server saves exact terms and its own timestamp before processing, including failed scans', async () => {
  const original = globalThis.fetch;
  const events = [];
  let record;
  globalThis.fetch = async url => { events.push(String(url).endsWith('/api/classify') ? 'classify' : 'indicators'); throw new Error('offline'); };
  try {
    await scanController('http://localhost:8000', undefined, undefined, { create: async fields => {
      record = fields; events.push('consent'); return { ...fields, _id: 'consent1' };
    } })({ body: { text: 'hello', tosAccepted: true, termsVersion: SCAN_TERMS.version,
      acceptedAt: '1900-01-01', termsText: 'forged', userId: 'forged' } }, { status() { return this; }, json() {} });
    assert.deepEqual(events, ['consent', 'classify', 'indicators']);
    assert.equal(record.termsText, SCAN_TERMS.text);
    assert.equal(record.termsSha256, createHash('sha256').update(SCAN_TERMS.text).digest('hex'));
    assert.equal(record.userId, null);
    assert.equal(record.source, 'guest');
    assert.ok(Date.now() - record.acceptedAt.getTime() < 5000);
    assert.equal('text' in record, false);
  } finally { globalThis.fetch = original; }
});
