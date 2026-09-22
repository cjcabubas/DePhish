import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { SCAN_TERMS } from '../../client/src/data/scanTerms.js';

// Opt in with ML_INTEGRATION_URL=http://127.0.0.1:<port> against the real Python service.
test('real ML endpoints through Express preserve consent, independent evidence, and redacted persistence', { skip: !process.env.ML_INTEGRATION_URL }, async t => {
  const mlUrl = new URL(process.env.ML_INTEGRATION_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(mlUrl.hostname));
  let saved, consent, submitted;
  const app = createApp({ config: { mlApiUrl: mlUrl.href, origins: [], sessionSecret: 'integration-key-at-least-32-characters' },
    consents: { create: async fields => { consent = fields; return { ...fields, _id: 'consent-test' }; } },
    scans: { create: async fields => { saved = fields; return { _id: 'scan-test' }; } },
    reports: { create: async fields => { submitted = fields; return { ...fields, _id: 'report-test' }; } },
    identifiers: { record: async () => {} } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/scans/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' },
    body: JSON.stringify({ text: 'URGENT: your account will be suspended. Share your OTP 719281. https://notice.invalid/Case',
      type: 'auto', tosAccepted: true, termsVersion: SCAN_TERMS.version }),
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.textAnalysis.status, 'complete');
  assert.equal(report.indicatorAnalysis.status, 'complete');
  assert.equal(report.urlAnalysis.checks[0].destination.failure_code, 'INVALID_DOMAIN');
  assert.equal(report.assessment.components.urlPoints, 5);
  assert.equal(report.assessment.overallRiskScore, Math.min(100, Math.round((report.assessment.components.modelScore + 5) * 10) / 10));
  assert.equal(report.entityAnalysis.credentials.otpDetected, true);
  assert.equal(report.persistence.status, 'saved');
  assert.equal(saved.consentId, 'consent-test');
  assert.equal(consent.termsText, SCAN_TERMS.text);
  assert.equal(JSON.stringify(saved).includes('719281'), false);
  assert.ok(saved.expiresAt instanceof Date);
  const savedScan = saved;
  const submission = await fetch(`http://127.0.0.1:${server.address().port}/api/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DePhish-Client': 'web' },
    body: JSON.stringify({ message: 'URGENT: verify your account now. OTP 719281. https://notice.invalid/Case',
      tosAccepted: true, termsVersion: SCAN_TERMS.version }),
  });
  assert.equal(submission.status, 201);
  assert.equal(submitted.status, 'pending');
  assert.equal(submitted.analysis.textAnalysis.status, 'complete');
  assert.equal(submitted.analysis.indicatorAnalysis.status, 'complete');
  assert.equal(JSON.stringify(submitted).includes('719281'), false);
  assert.equal(saved, savedScan, 'Report submission must not create a scan-history record');
});
