import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, isPublicAddress, resolvePublic, certificateSummary, publicJson } from '../src/services/safeNetwork.js';
import { parseRegistration, lookupRegistration, inspectDestination, inspectLink, inspectionError } from '../src/services/linkService.js';
import { linkRisk } from '../src/services/scanService.js';

test('invalid domain labels and empty DNS answers fail before connection', async () => {
  for (const input of ['https://bad_name.com', 'https://-bad.com', 'https://bad-.com', `https://${'a'.repeat(64)}.com`]) assert.throws(() => normalizeUrl(input), /domain label/);
  await assert.rejects(resolvePublic('public.com', AbortSignal.timeout(1000), async () => []), { code: 'ENOTFOUND' });
  const controller = new AbortController(); controller.abort();
  let called = false;
  await assert.rejects(resolvePublic('public.com', controller.signal, async () => { called = true; return []; }));
  assert.equal(called, false);
});

test('redirect errors are explicit and retain inspected hops', async () => {
  const signal = AbortSignal.timeout(1000), url = normalizeUrl('https://example.com');
  for (const [location, code] of [[undefined, 'MISSING_REDIRECT_LOCATION'], ['file:///secret', 'INVALID_REDIRECT'], ['https://user:pass@example.com', 'INVALID_REDIRECT'], ['http://example.com', 'HTTPS_DOWNGRADE']]) {
    const result = await inspectDestination(url, signal, async () => ({ status: 302, location }));
    assert.equal(result.failure_code, code); assert.equal(result.redirects.length, 1);
  }
  const loop = await inspectDestination(url, signal, async () => ({ status: 302, location: url.href }));
  assert.equal(loop.failure_code, 'REDIRECT_LOOP');
  let calls = 0;
  const limit = await inspectDestination(url, signal, async () => ({ status: 302, location: `/hop${++calls}` }));
  assert.equal(limit.failure_code, 'REDIRECT_LIMIT'); assert.equal(calls, 4);
});

test('restricted requests and unsupported HEAD stay unknown without server-error points', async () => {
  for (const [status, code] of [[401, 'ACCESS_RESTRICTED'], [403, 'ACCESS_RESTRICTED'], [429, 'REMOTE_RATE_LIMIT'], [405, 'HEAD_UNSUPPORTED'], [501, 'HEAD_UNSUPPORTED']]) {
    const destination = await inspectDestination(normalizeUrl('https://example.com'), AbortSignal.timeout(1000), async () => ({ status }));
    assert.equal(destination.status, 'incomplete'); assert.equal(destination.failure_code, code);
    assert.equal(linkRisk({ destination }).score, 0);
  }
});

test('timeouts, certificate errors, environment restrictions, and bad responses stay distinct', async () => {
  for (const [error, code, tls] of [
    [{ name: 'TimeoutError' }, 'TIMEOUT', 'unavailable'],
    [{ cause: { code: 'ENOTFOUND' } }, 'ENOTFOUND', 'unavailable'],
    [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'ERR_TLS_CERT_ALTNAME_INVALID', 'invalid'],
    [{ code: 'EPROTO' }, 'EPROTO', 'unavailable'],
    [{ code: 'EACCES' }, 'EACCES', 'unavailable'],
  ]) {
    const failure = inspectionError(error);
    assert.equal(failure.failure_code, code); assert.equal(failure.tls.status, tls);
  }
  const invalid = await inspectDestination(normalizeUrl('https://example.com'), AbortSignal.timeout(1000), async () => ({ status: undefined }));
  assert.equal(invalid.failure_code, 'INVALID_RESPONSE'); assert.equal(linkRisk({ destination: invalid }).score, 0);
});

test('registration lookup rejection preserves completed connection evidence', async () => {
  const result = await inspectLink('https://example.com', { request: async () => ({ status: 200, tls: { status: 'valid' } }), registration: () => { throw Object.assign(new Error(), { code: 'TIMEOUT' }); } });
  assert.equal(result.registration.status, 'unavailable'); assert.equal(result.registration.failure_code, 'TIMEOUT');
  assert.equal(result.destination.status, 'checked'); assert.equal(result.destination.redirects[0].tls.status, 'valid');
});

test('URL validation and SSRF address boundaries', async () => {
  for (const input of ['file:///etc/passwd', 'http://user:pass@example.com', 'http://example.com:8080', 'http://localhost', 'http://example.com\\@127.0.0.1', 'http://example.com\n']) {
    if (input.endsWith('\n')) continue; // surrounding whitespace is trimmed
    assert.throws(() => normalizeUrl(input));
  }
  assert.equal(normalizeUrl('hxxps://example[.]com/a').href, 'https://example.com/a');
  for (const address of ['127.0.0.1', '10.1.1.1', '169.254.169.254', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '192.0.2.1']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  const signal = AbortSignal.timeout(1000);
  await assert.rejects(resolvePublic('evil.com', signal, async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]), /blocked/);
  const answer = await resolvePublic('public.com', signal, async () => [{ address: '8.8.8.8', family: 4 }]);
  assert.equal(answer.address, '8.8.8.8');
});

test('redirects are bounded, rechecked, and cannot downgrade HTTPS', async () => {
  let calls = 0;
  const result = await inspectDestination(normalizeUrl('https://example.com'), AbortSignal.timeout(1000), async url => {
    calls++;
    if (calls === 1) return { status: 302, location: 'https://127.0.0.1/', tls: { status: 'valid' } };
    await resolvePublic(new URL(url).hostname, AbortSignal.timeout(1000), async () => [{ address: '127.0.0.1', family: 4 }]);
  });
  assert.equal(result.status, 'blocked'); assert.equal(calls, 2);
  const downgrade = await inspectDestination(normalizeUrl('https://example.com'), AbortSignal.timeout(1000), async () => ({ status: 302, location: 'http://example.com', tls: { status: 'valid' } }));
  assert.match(downgrade.reason, /downgrades/);
  const invalid = await inspectDestination(normalizeUrl('https://example.com'), AbortSignal.timeout(1000), async () => { throw Object.assign(new Error(), { code: 'CERT_HAS_EXPIRED' }); });
  assert.equal(invalid.tls.status, 'invalid');
});

test('registration age is distinct from creator and unavailable records stay unknown', async () => {
  const data = { events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }], entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]] }] };
  const parsed = parseRegistration(data, 'https://registry.example/domain/example.com', Date.parse('2020-01-11T00:00:00Z'));
  assert.equal(parsed.age_days, 10); assert.equal(parsed.registrar, 'Example Registrar'); assert.equal(parsed.registrant, null);
  assert.equal(parseRegistration({}, '').age_days, null);
  assert.equal(certificateSummary({ valid_to: 'Jan 11 00:00:00 2020 GMT', issuer: { O: 'Test CA' } }, Date.parse('2020-01-01')).days_remaining, 10);
  const unavailable = await lookupRegistration('example.ph', AbortSignal.timeout(1000), async () => ({ data: { services: [] } }));
  assert.equal(unavailable.status, 'unavailable');
});

test('RDAP redirects validate each destination and limit loops', async () => {
  await assert.rejects(publicJson('https://example.com', AbortSignal.timeout(1000), async () => ({ status: 302, location: 'file:///etc/passwd' })), /public|valid/);
  let count = 0;
  await assert.rejects(publicJson('https://example.com', AbortSignal.timeout(1000), async () => { count++; return { status: 302, location: 'https://example.com/again' }; }), /Too many/);
  assert.equal(count, 4);
});

test('partial results preserve TLS evidence when RDAP is unavailable', async () => {
  const result = await inspectLink('https://example.com', { request: async () => ({ status: 200, tls: { status: 'valid' } }), registration: async domain => { assert.equal(domain, 'example.com'); return { status: 'unavailable' }; } });
  assert.equal(result.destination.status, 'checked'); assert.equal(result.registration.status, 'unavailable');
});
