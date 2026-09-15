import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { dashboardController } from '../src/controllers/dashboardController.js';

const empty = { total: 0, phishing: 0, suspicious: 0, legitimate: 0, unclassified: 0, active_accounts: 0, activity: [], indicators: [] };

test('dashboard endpoints enforce account ownership and admin role, ignoring query overrides', async t => {
  const records = new Map();
  const users = {
    create: async fields => { const user = { ...fields, _id: String(records.size + 1).padStart(24, '0') }; records.set(user._id, user); return user; },
    findByEmail: async email => [...records.values()].find(user => user.email === email),
    findById: async id => records.get(id),
  };
  const calls = [];
  const scans = { stats: async (owner, since) => { calls.push({ owner, since }); return { ...empty, total: owner ? 123 : 456, legitimate: owner ? 123 : 456 }; } };
  const store = new session.MemoryStore();
  const server = createApp({ config: readConfig({ SESSION_SECRET: 'test-only-secret-at-least-32-characters' }), users, store, scans }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { store.clear(() => {}); server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, cookie) => fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal((await get('/api/scans/stats')).status, 401);
  assert.equal((await get('/api/scans/admin/stats')).status, 401);
  const signup = await fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' }, body: JSON.stringify({ name: 'Dashboard Test', email: 'dashboard@example.com', password: 'test-dashboard-password' }) });
  assert.equal(signup.status, 201);
  const cookie = signup.headers.getSetCookie().find(value => value.includes('Path=/api;')).split(';')[0];
  const user = (await signup.json()).user;
  const response = await get('/api/scans/stats?userId=another-account&admin=true&limit=1', cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.total, 123); // Totals aren't inferred from the 50-row history page.
  assert.equal(data.scope, 'account');
  assert.equal(calls[0].owner, user.id);
  assert.equal(data.activity.length, 30);
  assert.equal((await get('/api/scans/admin/stats', cookie)).status, 403);
  assert.equal(calls.length, 1);
  records.get(user.id).role = 'admin';
  const admin = await get('/api/scans/admin/stats', cookie);
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).scope, 'all_accounts');
  assert.equal(calls.at(-1).owner, null);
  scans.stats = async () => { throw new Error('private database details'); };
  const failed = await get('/api/scans/stats', cookie);
  assert.equal(failed.status, 503);
  assert.ok(!JSON.stringify(await failed.json()).includes('private database'));
});

test('30-day UTC activity fills empty dates across a year boundary and preserves real zero totals', async () => {
  let since;
  const scans = { stats: async (_, start) => { since = start; return { ...empty, total: 2, suspicious: 2, activity: [{ date: '2026-12-31', total: 2, phishing: 0, suspicious: 2, legitimate: 0 }] }; } };
  let data;
  await dashboardController(scans, { now: () => new Date('2027-01-05T14:23:00Z') })({ user: { _id: 'owner' } }, { json: value => { data = value; } });
  assert.equal(since.toISOString(), '2026-12-07T00:00:00.000Z');
  assert.equal(data.activity.length, 30);
  assert.equal(data.activity.at(-1).date, '2027-01-05');
  assert.equal(data.activity.find(day => day.date === '2026-12-31').suspicious, 2);
  assert.equal(data.activity[0].total, 0);
  let status;
  await dashboardController(undefined)({}, { status: value => { status = value; return { json() {} }; } });
  assert.equal(status, 503);
});
