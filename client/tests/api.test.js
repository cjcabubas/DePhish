import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/services/api.js';

test('scan request, history, and service errors', async () => {
  const originalFetch = globalThis.fetch;
  const result = { prediction: 'Legitimate', risk_score: 12.3, risk_level: 'Low Risk', message_type: 'sms', detected_indicators: [], detected_urls: [] };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/scans/analyze');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { text: 'See you at lunch', type: 'sms' });
      return { ok: true, json: async () => result };
    };
    assert.deepEqual(await api.scans.analyze('See you at lunch', 'sms'), result);
    const scans = await api.scans.list();
    assert.equal(scans.length, 1);
    assert.equal(scans[0].score, 12.3);
    assert.equal(scans[0].type, 'SMS');
    assert.equal(scans[0].status, 'Low risk');
    await assert.rejects(api.scans.analyze('  '), /Paste a message/);
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(api.scans.analyze('test'), /service is unavailable/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(api.scans.analyze('test'), /Cannot reach/);
    globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError'); };
    await assert.rejects(api.scans.analyze('test'), /timed out/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    await assert.rejects(api.scans.analyze('test'), /invalid result/);
    assert.equal((await api.scans.list()).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});
