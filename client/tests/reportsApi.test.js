import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/services/api.js';

test('reports use their own endpoints with admin status decisions and credentials', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => ({ report: { status: 'pending' } }) }; };
  try {
    await api.reports.submit({ message: 'hello', tosAccepted: true, termsVersion: '1.0' });
    await api.reports.list({ admin: true, status: 'pending', page: 2 });
    await api.reports.list({ status: 'rejected' });
    await api.reports.review('id', { status: 'verified', revision: 0, indicatorIds: ['selected'], note: 'Confirmed', emailReviewed: true });
    await api.reports.threats();
    assert.deepEqual(calls.map(call => call.url), ['/api/reports', '/api/reports/admin?status=pending&page=2', '/api/reports?status=rejected&page=1', '/api/reports/id/status', '/api/reports/threat-indicators?page=1']);
    assert.ok(calls.every(call => call.credentials === 'same-origin'));
    assert.equal(calls[3].method, 'PATCH'); assert.equal(calls[3].headers['X-DePhish-Client'], 'web');
    assert.equal(JSON.parse(calls[3].body).revision, 0);
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ message: 'Another admin changed this report.' }) });
    await assert.rejects(api.reports.review('id', {}), /Another admin changed/);
  } finally { globalThis.fetch = original; }
});
