import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';
import { scanController } from '../src/controllers/scanController.js';

test('upstream ML limits are returned as retryable 429 responses', async () => {
  const original = globalThis.fetch;
  let status, retry, body;
  try {
    globalThis.fetch = async () => ({ status: 429, ok: false });
    const response = { set(key, value) { retry = value; }, status(value) { status = value; return this; }, json(value) { body = value; } };
    await scanController('http://localhost:8000')({ body: { text: 'test' } }, response);
    assert.equal(status, 429); assert.equal(retry, '60'); assert.match(body.message, /request limit reached/);
  } finally { globalThis.fetch = original; }
});

test('API budget spans endpoints, returns JSON retry headers, and excludes health checks', async t => {
  const config = readConfig({});
  const server = createApp({ config, apiLimit: 2 }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/missing')).status, 404);
  assert.equal((await fetch(base + '/api/scans')).status, 401);
  const blocked = await fetch(base + '/api/auth/me');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.match((await blocked.json()).message, /Too many API requests/);
  assert.notEqual((await fetch(base + '/health')).status, 429);
});

test('scan endpoint stops excess attempts with a readable limit response', async t => {
  const server = createApp({ config: readConfig({}) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/scans/analyze`;
  const request = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' }, body: JSON.stringify({ text: '' }) });
  for (let index = 0; index < 10; index++) assert.equal((await request()).status, 400);
  const blocked = await request();
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).message, /Too many scans/);
});
