import test from 'node:test';
import assert from 'node:assert/strict';
import { assessScan } from '../src/services/scanService.js';
import { inspectLink } from '../src/services/linkService.js';
const base = { risk_score: 20, prediction: 'Legitimate', probabilities: { phishing: .2 }, detected_urls: [{ url: 'https://example.com' }, { url: 'https://example.com' }] };

test('reserved .invalid example adds broken-link points', async () => {
  const url = 'https://google-account-security-check.invalid/login/verify';
  const result = await assessScan({}, { classify: async () => ({ ...base, detected_urls: [{ url }] }), inspect: inspectLink });
  assert.equal(result.link_checks[0].destination.failure_code, 'INVALID_DOMAIN');
  assert.equal(result.link_checks[0].risk.factors[0].code, 'invalid_domain');
  assert.equal(result.link_risk.points, 5);
  assert.equal(result.risk_score, 25);
});
test('link evidence affects decision without changing model probability or duplicating points', async () => {
  let calls = 0;
  const result = await assessScan({}, { classify: async () => base, inspect: async url => {
    calls++; return { url, registration: { status: 'available', age_days: 5 }, destination: { status: 'incomplete', tls: { status: 'invalid' }, redirects: [] } };
  } });
  assert.equal(calls, 1); assert.equal(result.risk_score, 60); assert.equal(result.prediction, 'Suspicious');
  assert.equal(result.model_risk_score, 20); assert.equal(result.probabilities.phishing, .2);
});
test('missing evidence does not raise or lower risk and outgoing checks are capped', async () => {
  const result = await assessScan({}, { classify: async () => ({ ...base, detected_urls: Array.from({length:5}, (_,i)=>({url:`https://example.com/${i}`})) }), inspect: async () => { throw new Error('offline'); } });
  assert.equal(result.risk_score, 20); assert.equal(result.link_risk.incomplete, true); assert.equal(result.link_risk.skipped, 2);
});
test('old domain and valid TLS never override high message risk', async () => {
  const result = await assessScan({}, { classify: async () => ({ ...base, risk_score: 85 }), inspect: async url => ({url, registration:{ status:'available', age_days:1000 }, destination:{ status:'checked', redirects:[{url,tls:{status:'valid'}}] }}) });
  assert.equal(result.risk_score,85); assert.equal(result.prediction,'Phishing');
});

test('unreachable and broken destinations add a small risk contribution', async () => {
  for (const destination of [
    { status: 'incomplete', failure_code: 'ENOTFOUND', redirects: [] },
    { status: 'incomplete', failure_code: 'ABORT_ERR', redirects: [] },
    { status: 'checked', redirects: [{ url: 'https://example.com', http_status: 404 }] },
    { status: 'checked', redirects: [{ url: 'https://example.com', http_status: 503 }] },
  ]) {
    const result = await assessScan({}, { classify: async () => base, inspect: async url => ({ url, registration: { status: 'unavailable' }, destination }) });
    assert.equal(result.risk_score, 25);
    assert.equal(result.link_checks[0].risk.factors[0].code, 'unavailable_destination');
  }
});
test('missing registration, restricted access, and unsupported HEAD do not imply a broken destination', async () => {
  for (const status of [200, 403, 405]) {
    const result = await assessScan({}, { classify: async () => base, inspect: async url => ({ url, registration: { status: 'unavailable' }, destination: { status: 'checked', redirects: [{url, http_status: status}] } }) });
    assert.equal(result.risk_score, 20);
  }
});
