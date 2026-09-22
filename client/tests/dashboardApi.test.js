import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/services/api.js';

test('dashboard requests use private endpoints and never replace errors with demo statistics', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.credentials, 'same-origin');
      assert.ok(['/api/scans/stats', '/api/scans/admin/stats'].includes(url));
      return { ok: true, json: async () => ({ total: 0, scope: url.includes('admin') ? 'all_accounts' : 'account' }) };
    };
    assert.equal((await api.dashboard.stats()).total, 0);
    assert.equal((await api.dashboard.stats(true)).scope, 'all_accounts');
    for (const [status, message] of [[401, /session has expired/], [403, /do not have access/], [503, /unavailable/]]) {
      globalThis.fetch = async () => ({ status, ok: false });
      await assert.rejects(api.dashboard.stats(), message);
    }
    assert.equal(typeof api.reports.list, 'function');
    globalThis.fetch = async () => ({ status: 401, ok: false });
    await assert.rejects(api.scans.list({ authenticated: true }), /session has expired/);
  } finally { globalThis.fetch = original; }
});
