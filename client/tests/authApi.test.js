import test from 'node:test';
import assert from 'node:assert/strict';
import { authApi } from '../src/services/authApi.js';

test('auth uses cookie credentials, maps failures, and restores anonymous sessions', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/auth/login');
      assert.equal(options.credentials, 'include');
      assert.equal(options.headers['X-DePhish-Client'], 'web');
      assert.deepEqual(JSON.parse(options.body), { email: 'user@example.com', password: 'password' });
      return { ok: true, status: 200, json: async () => ({ user: { id: '1' } }) };
    };
    assert.deepEqual(await authApi.login({ email: 'user@example.com', password: 'password' }), { user: { id: '1' } });
    globalThis.fetch = async () => ({ status: 401 });
    assert.deepEqual(await authApi.me(), { user: null });
    globalThis.fetch = async () => ({ status: 503 });
    await assert.rejects(authApi.signup({}), /not available/);
    globalThis.fetch = async () => ({ status: 429, ok: false, json: async () => ({ message: 'Too many attempts' }) });
    await assert.rejects(authApi.login({}), /Too many attempts/);
    globalThis.fetch = async () => ({ status: 204 });
    assert.equal(await authApi.logout(), null);
  } finally { globalThis.fetch = original; }
});
