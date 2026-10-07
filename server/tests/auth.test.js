import test from 'node:test';
import assert from 'node:assert/strict';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { requireRole } from '../src/middleware/auth.js';
import { User } from '../src/models/User.js';
import { fakeOtp, signupWithOtp } from './fakeOtp.js';
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
  const app = createApp({ config, users, store, otpService: fakeOtp(users), ...options });
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
  let response = await signupWithOtp(request, account);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.deepEqual(data.user, { id: '1', name: 'Test User', email: 'test@example.com', role: 'user' });
  assert.equal('passwordHash' in data.user, false);
  const stored = records.get('1');
  assert.notEqual(stored.passwordHash, account.password);
  assert.equal(await bcrypt.compare(account.password, stored.passwordHash), true);
  const firstHeader = response.headers.getSetCookie().find(value => value.includes('Path=/api;'));
  assert.match(firstHeader, /HttpOnly/); assert.match(firstHeader, /SameSite=Lax/);
  let cookie = firstHeader.split(';')[0];
  assert.equal((await request('/api/auth/me', undefined, cookie)).status, 200);
  assert.equal((await request('/api/auth/me')).status, 401);
  assert.equal((await request('/api/auth/signup/verify', { ...account, code: '000042' })).status, 400);
  const bad = await request('/api/auth/login', { email: account.email, password: 'wrong' });
  const unknown = await request('/api/auth/login', { email: 'missing@example.com', password: 'wrong' });
  assert.equal(bad.status, 401); assert.deepEqual(await bad.json(), await unknown.json());
  response = await request('/api/auth/login', account, cookie);
  assert.equal(response.status, 200);
  const previous = cookie; cookie = response.headers.getSetCookie().find(value => value.includes('Path=/api;')).split(';')[0];
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
    assert.equal((await request('/api/auth/signup/verify', { ...body, code: '000042' })).status, 400);
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

test('MFA does not issue a session before code verification, while disabled MFA keeps password login direct', async t => {
  const { request, records } = await setup(t);
  const created = await signupWithOtp(request, account);
  const user = records.get('1');
  user.mfaEnabled = false;
  let response = await request('/api/auth/login', { email: account.email, password: account.password });
  assert.equal(response.status, 200); assert.equal((await response.json()).mfaRequired, undefined); assert.ok(response.headers.get('set-cookie'));
  user.mfaEnabled = true;
  response = await request('/api/auth/login', { email: account.email, password: account.password });
  assert.equal(response.status, 200); const challenge = await response.json(); assert.equal(challenge.mfaRequired, true); assert.equal(response.headers.getSetCookie().some(value => value.startsWith('dephish.sid=')), false);
  const bypass = await request('/api/auth/mfa-login/verify', { email: account.email, challengeToken: challenge.challengeToken, code: '123456' });
  assert.equal(bypass.status, 400); assert.equal(bypass.headers.getSetCookie().some(value => value.startsWith('dephish.sid=')), false);
  const completed = await request('/api/auth/mfa-login/verify', { email: account.email, challengeToken: challenge.challengeToken, code: '000042' });
  assert.equal(completed.status, 200); assert.ok(completed.headers.get('set-cookie'));
  assert.ok(created.headers.get('set-cookie'));
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

test('scan history requires an account and scopes queries to its owner', async t => {
  const seen = [];
  const scans = { list: async (userId, limit) => { seen.push({userId, limit}); return [{_id:'scan1',title:'Meeting',createdAt:new Date(),result:{risk_score:25}}]; } };
  const {request} = await setup(t, {scans});
  assert.equal((await request('/api/scans')).status,401);
  const signup = await signupWithOtp(request, account);
  const cookie = signup.headers.getSetCookie().find(value => value.includes('Path=/api;')).split(';')[0];
  const response = await request('/api/scans?userId=someone-else&limit=5',undefined,cookie);
  assert.equal(response.status,200);
  assert.deepEqual(seen,[{userId:'1',limit:5}]);
  for (const limit of ['0','101','-1','abc']) assert.equal((await request('/api/scans?limit='+limit,undefined,cookie)).status,400);
  assert.equal((await request('/api/scans/analyze',{text:'hello'},cookie,{Origin:'https://untrusted.example'})).status,403);
  await request('/api/auth/logout',{},cookie);
  assert.equal((await request('/api/scans',undefined,cookie)).status,401);
});

test('migration failure prevents authenticated success and preserves guest proof for login retry', async t => {
  let fail = true;
  const claims = [];
  const { request } = await setup(t, { ownership: { async claim(guestId, userId) {
    claims.push({ guestId, userId });
    if (fail) throw new Error('Private database failure');
  } } });
  const bootstrap = await request('/api/auth/me');
  const guest = bootstrap.headers.getSetCookie().find(value => value.startsWith('dephish.guest=')).split(';')[0];
  await request('/api/auth/signup', { name: account.name, email: account.email }, guest);
  const response = await request('/api/auth/signup/verify', { ...account, code: '000042', userId: 'forged', guestId: 'forged' }, guest);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('Private database'), false);
  assert.equal(response.headers.getSetCookie().some(value => value.startsWith('dephish.sid=')), false);
  assert.equal(claims[0].userId, '1'); assert.match(claims[0].guestId, /^guest_[a-f0-9]{64}$/);
  fail = false;
  const retry = await request('/api/auth/login', account, guest);
  assert.equal(retry.status, 200);
  assert.deepEqual(claims[1], claims[0]);
  const rotated = retry.headers.getSetCookie().find(value => value.startsWith('dephish.guest=')).split(';')[0];
  assert.notEqual(rotated, guest);
});

test('email transport failures are unavailable errors, not rate limits, and do not leak provider details', async t => {
  const { request } = await setup(t, { otpService: { configured: true, async requestRegistration() {
    throw Object.assign(new Error('Connection timeout: private-provider.example'), { code: 'ETIMEDOUT' });
  } } });
  for (const path of ['/api/auth/signup', '/api/auth/signup/resend']) {
    const response = await request(path, { name: 'Test', email: 'test@example.com' });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.match(body, /Unable to send/);
    assert.doesNotMatch(body, /private-provider|Connection timeout/);
  }
});

test('OTP cooldowns retain their rate-limit status', async t => {
  const { request } = await setup(t, { otpService: { configured: true, async requestRegistration() {
    throw Object.assign(new Error('Please wait 60 seconds before requesting another code.'), { code: 'OTP_RATE_LIMIT' });
  } } });
  const response = await request('/api/auth/signup', { name: 'Test', email: 'test@example.com' });
  assert.equal(response.status, 429);
});

test('shared networks can request more than five codes while the IP cap remains enforced', async t => {
  const { request } = await setup(t);
  for (let i = 0; i < 30; i++) {
    const response = await request('/api/auth/signup', { name: 'Test', email: `test${i}@example.com` });
    assert.equal(response.status, 202);
  }
  assert.equal((await request('/api/auth/signup', { name: 'Test', email: 'extra@example.com' })).status, 429);
});

test('successful logins do not consume the failed-login budget', async t => {
  const { request } = await setup(t, { authLimit: 1 });
  await signupWithOtp(request, account);
  assert.equal((await request('/api/auth/login', account)).status, 200);
  assert.equal((await request('/api/auth/login', account)).status, 200);
  assert.equal((await request('/api/auth/login', { ...account, password: 'incorrect' })).status, 401);
  assert.equal((await request('/api/auth/login', { ...account, password: 'incorrect' })).status, 429);
});
