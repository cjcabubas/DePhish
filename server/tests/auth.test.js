import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { requireRole } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
const config = readConfig({ SESSION_SECRET: 'test-only-secret-at-least-32-characters' });

async function setup(t, options = {}) {
  const records = new Map();
  const users = {
    async create(fields) {
      if ([...records.values()].some(user => user.email === fields.email)) throw Object.assign(new Error(), { code: 11000 });
      const user = { ...fields, _id: String(records.size + 1) }; records.set(user._id, user); return user;
    },
    async findByEmail(email) { return [...records.values()].find(user => user.email === email); },
    async findById(id) { return records.get(id); },
  };
  const store = new session.MemoryStore(); // Tests only; runtime uses MongoDB sessions.
  const app = createApp({ config, users, store, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { store.clear(() => {}); server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, cookie, extra = {}) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web', Origin: 'http://localhost:5173' }), ...(cookie ? { Cookie: cookie } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { request, records };
}
const account = { name: 'Test User', email: 'TEST@example.com', password: 'test-password-1234', role: 'admin' };

test('signup, secure storage, login, rotation, restoration, and logout', async t => {
  const { request, records } = await setup(t);
  let response = await request('/api/auth/signup', account);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.deepEqual(data.user, { id: '1', name: 'Test User', email: 'test@example.com', role: 'user' });
  assert.equal('passwordHash' in data.user, false);
  const stored = records.get('1');
  assert.notEqual(stored.passwordHash, account.password);
  assert.equal(await bcrypt.compare(account.password, stored.passwordHash), true);
  const firstHeader = response.headers.get('set-cookie');
  assert.match(firstHeader, /HttpOnly/); assert.match(firstHeader, /SameSite=Lax/);
  let cookie = firstHeader.split(';')[0];
  assert.equal((await request('/api/auth/me', undefined, cookie)).status, 200);
  assert.equal((await request('/api/auth/me')).status, 401);
  assert.equal((await request('/api/auth/signup', account)).status, 409);
  const bad = await request('/api/auth/login', { email: account.email, password: 'wrong' });
  const unknown = await request('/api/auth/login', { email: 'missing@example.com', password: 'wrong' });
  assert.equal(bad.status, 401); assert.deepEqual(await bad.json(), await unknown.json());
  response = await request('/api/auth/login', account, cookie);
  assert.equal(response.status, 200);
  const previous = cookie; cookie = response.headers.get('set-cookie').split(';')[0];
  assert.notEqual(cookie, previous);
  assert.equal((await request('/api/auth/me', undefined, previous)).status, 401);
  records.get('1').role = 'admin';
  assert.equal((await (await request('/api/auth/me', undefined, cookie)).json()).user.role, 'admin');
  assert.equal((await request('/api/auth/logout', {}, cookie)).status, 204);
  assert.equal((await request('/api/auth/me', undefined, cookie)).status, 401);
});

test('reject invalid input, injected fields, cross-origin requests, and oversized bodies', async t => {
  const { request } = await setup(t);
  for (const body of [{ ...account, password: 'short' }, { ...account, email: { $ne: null } }, { ...account, name: '' }, { ...account, password: '🔒'.repeat(20) }])
    assert.equal((await request('/api/auth/signup', body)).status, 400);
  assert.equal((await request('/api/auth/signup', account, null, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request('/api/auth/signup', account, null, { 'X-DePhish-Client': '' })).status, 403);
  assert.equal((await request('/api/auth/signup', { ...account, name: 'x'.repeat(20000) })).status, 413);
});

test('unconfigured service does not simulate signup or issue cookies', async t => {
  const { request } = await setup(t, { store: undefined, isReady: () => false });
  const response = await request('/api/auth/signup', account);
  assert.equal(response.status, 503); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await request('/health')).status, 503);
});

test('authentication attempts are rate limited', async t => {
  const { request } = await setup(t, { authLimit: 1 });
  await request('/api/auth/login', { email: 'invalid' });
  assert.equal((await request('/api/auth/login', { email: 'invalid' })).status, 429);
});

test('role guard, user schema, and configuration validation', () => {
  let status; const response = { status(code) { status = code; return this; }, json() {} };
  requireRole('admin')({}, response, () => assert.fail()); assert.equal(status, 401);
  requireRole('admin')({ user: { role: 'user' } }, response, () => assert.fail()); assert.equal(status, 403);
  let allowed = false; requireRole('admin')({ user: { role: 'admin' } }, response, () => { allowed = true; }); assert.equal(allowed, true);
  assert.equal(User.schema.path('passwordHash').options.select, false);
  assert.equal(User.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique), true);
  assert.throws(() => readConfig({ SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /HTTPS/);
});
