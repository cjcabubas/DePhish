import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMessage } from '../src/services/api.js';
import { SCAN_TERMS } from '../src/data/scanTerms.js';

test('frontend sends the accepted version and surfaces consent storage and renewal errors', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, message] of [[409, 'Review the current terms.'], [503, 'Consent could not be saved.']]) {
      globalThis.fetch = async (url, options) => {
        assert.deepEqual(JSON.parse(options.body), { text: 'hello', type: 'email', tosAccepted: true, termsVersion: SCAN_TERMS.version });
        return { ok: false, status, json: async () => ({ message }) };
      };
      await assert.rejects(analyzeMessage('hello', 'email', { tosAccepted: true, termsVersion: SCAN_TERMS.version }), { message });
    }
  } finally { globalThis.fetch = original; }
});
