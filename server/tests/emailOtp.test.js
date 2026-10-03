import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createEmailOtpService } from '../src/services/emailOtpService.js';

function setup({ send = async () => {}, start = 1_700_000_000_000 } = {}) {
  let time = start, id = 0; const rows = new Map(), grantRows = new Map(), sent = [];
  const otps = {
    get: async (email, purpose) => rows.get(email + ':' + purpose) || null,
    put: async (email, purpose, fields) => { const key = email + ':' + purpose, current = rows.get(key); const row = { ...fields, _id: current?._id || String(++id) }; rows.set(key, row); return row; },
    remove: async (email, purpose) => rows.delete(email + ':' + purpose),
    consume: async (rowId, now, hash) => { for (const row of rows.values()) if (row._id === rowId && row.codeExpiresAt > now && row.codeHash === hash) { row.codeHash = undefined; row.challengeHash = undefined; row.codeExpiresAt = now; return row; } return null; },
    incrementAttempts: async rowId => { for (const row of rows.values()) if (row._id === rowId && row.attempts < 5) row.attempts++; },
  };
  const usersByEmail = new Map(), users = {
    findByEmailAddress: async email => usersByEmail.get(email) || null,
    findByEmail: async email => usersByEmail.get(email) || null,
    findById: async id => [...usersByEmail.values()].find(user => user._id === id) || null,
    create: async fields => { const user = { ...fields, _id: String(++id), sessionVersion: 0 }; usersByEmail.set(user.email, user); return user; },
    updatePassword: async (userId, passwordHash) => { const user = [...usersByEmail.values()].find(item => item._id === userId); user.passwordHash = passwordHash; user.sessionVersion++; },
    setMfa: async (userId, enabled) => { const user = [...usersByEmail.values()].find(item => item._id === userId); user.mfaEnabled = enabled; user.sessionVersion++; return user; },
  };
  const grants = { put: async fields => { grantRows.set(fields.email, { ...fields, _id: String(++id) }); }, find: async (email, hash, now) => { const row = grantRows.get(email); return row && row.tokenHash === hash && row.expiresAt > now ? row : null; }, consume: async (rowId, now) => { for (const [key, row] of grantRows) if (row._id === rowId && row.expiresAt > now) { grantRows.delete(key); return row; } return null; } };
  const email = { configured: true, sendOtp: async message => { sent.push(message); await send(message); }, sendPasswordChanged: async () => {} };
  const service = createEmailOtpService({ users, otps, grants, email, secret: 'unit-test-secret-with-sufficient-entropy', now: () => time });
  return { service, sent, rows, usersByEmail, setTime: value => { time = value; } };
}

test('OTP is a six-character numeric string including leading zeros and verifies once', async () => {
  let harness;
  harness = setup({ send: async message => { if (message.code.startsWith('0')) harness.leading = message.code; } });
  // A cryptographically random generator is used in production; repeat bounded test issuances until a leading zero occurs.
  for (let i = 0; i < 30 && !harness.leading; i++) { const email = `u${i}@example.test`; await harness.service.requestRegistration({ name: 'U', email }); }
  for (const sent of harness.sent) { assert.equal(typeof sent.code, 'string'); assert.match(sent.code, /^\d{6}$/); }
  const target = harness.sent.find(item => item.code.startsWith('0'));
  assert.ok(target, 'randomly generated six digit codes preserve leading zeros');
  const row = await harness.service.register({ name: 'U', email: target.to, password: 'correct horse battery staple', code: target.code });
  assert.ok(row);
  assert.equal(await harness.service.register({ name: 'U', email: target.to, password: 'correct horse battery staple', code: target.code }), null);
  assert.equal(await bcrypt.compare('correct horse battery staple', row.passwordHash), true);
  assert.equal('code' in (harness.rows.get(target.to + ':registration') || {}), false);
});

test('invalid attempts are capped, expiration and resend cooldown are enforced, and email failure invalidates the code', async () => {
  const h = setup(); await h.service.requestRegistration({ name: 'U', email: 'a@example.test' }); const code = h.sent[0].code;
  await assert.rejects(h.service.requestRegistration({ name: 'U', email: 'a@example.test' }), /wait/);
  for (let i = 0; i < 5; i++) assert.equal(await h.service.register({ name: 'U', email: 'a@example.test', password: 'long enough password', code: '999999' }), null);
  assert.equal(await h.service.register({ name: 'U', email: 'a@example.test', password: 'long enough password', code }), null);
  const expired = setup(); await expired.service.requestRegistration({ name: 'U', email: 'b@example.test' }); expired.setTime(1_700_000_000_000 + 5 * 60_000); assert.equal(await expired.service.register({ name: 'U', email: 'b@example.test', password: 'long enough password', code: expired.sent[0].code }), null);
  const failed = setup({ send: async () => { throw new Error('provider unavailable'); } }); await assert.rejects(failed.service.requestRegistration({ name: 'U', email: 'c@example.test' }), /provider/); assert.equal(failed.rows.size, 0);
});

test('resend request count is capped at five per rolling hour', async () => {
  const h = setup(); const base = 1_700_000_000_000;
  for (let attempt = 0; attempt < 5; attempt++) { h.setTime(base + attempt * 60_000); await h.service.requestRegistration({ name: 'U', email: 'limit@example.test' }); }
  h.setTime(base + 5 * 60_000);
  await assert.rejects(h.service.requestRegistration({ name: 'U', email: 'limit@example.test' }), /Too many code requests/);
  assert.equal(h.sent.length, 5);
});

test('password reset requires a verified OTP, short-lived grant, and changes the hashed password once', async () => {
  const h = setup();
  const account = { _id: 'existing', email: 'reset@example.test', name: 'Reset', passwordHash: 'old', sessionVersion: 0 };
  h.usersByEmail.set(account.email, account);
  await h.service.requestForgot(account.email); const code = h.sent.at(-1).code;
  const token = await h.service.verifyForgot({ email: account.email, code }); assert.equal(typeof token, 'string');
  assert.equal(await h.service.verifyForgot({ email: account.email, code }), null);
  assert.equal(await h.service.resetPassword({ email: account.email, resetToken: 'wrong', password: 'a much stronger replacement password' }), false);
  assert.equal(await h.service.resetPassword({ email: account.email, resetToken: token, password: 'a much stronger replacement password' }), true);
  assert.equal(await bcrypt.compare('a much stronger replacement password', account.passwordHash), true); assert.equal(account.sessionVersion, 1);
  assert.equal(await h.service.resetPassword({ email: account.email, resetToken: token, password: 'another replacement password' }), false);
});

test('MFA uses its own purpose and cannot return a user until the matching challenge code verifies', async () => {
  const h = setup(); const account = { _id: 'mfa-user', email: 'mfa@example.test', name: 'MFA', mfaEnabled: true, sessionVersion: 0 }; h.usersByEmail.set(account.email, account);
  const challengeToken = await h.service.startLoginMfa(account);
  assert.equal(await h.service.verifyLoginMfa({ email: account.email, code: h.sent[0].code, challengeToken: 'wrong' }), null);
  const authenticated = await h.service.verifyLoginMfa({ email: account.email, code: h.sent[0].code, challengeToken }); assert.equal(authenticated._id, account._id);
  assert.equal(await h.service.verifyLoginMfa({ email: account.email, code: h.sent[0].code, challengeToken }), null);
  await h.service.issueMfaSetting(account, true); assert.ok(h.rows.has(account.email + ':mfa_enable')); assert.equal(h.rows.get(account.email + ':mfa_login').codeHash, undefined);
  const changed = await h.service.confirmMfaSetting(account, h.sent.at(-1).code); assert.equal(changed.mfaEnabled, true); assert.equal(changed.sessionVersion, 1);
});
