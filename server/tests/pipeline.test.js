import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, extractArtifacts, detectMessageType } from '../src/services/artifactService.js';
import { orchestrateScan } from '../src/services/scanOrchestrator.js';
import { analyzerClient } from '../src/services/analyzerClient.js';
import { evaluateRisk } from '../src/services/riskService.js';

const model = probability => ({ probabilities: { phishing: probability, legitimate: 1 - probability },
  risk_score: probability * 100, prediction: probability >= .7 ? 'Phishing' : 'Legitimate', model_version: 'test' });
const rules = async () => ({ status: 'complete', indicators: [], phishing_type: 'Not established' });

test('canonical extraction preserves URL path case, normalizes obfuscation, and does not fetch email domains', () => {
  const input = normalizeInput('From: Jane <Support@EXAMPLE.com>\nHXXPS://Exa\u200bmple[.]com/CaseSensitive?Token=ABC https://example.com/CaseSensitive?Token=ABC Call 0917-555-0182 or +63 917 555 0182. OTP 719281.');
  const artifacts = extractArtifacts(input);
  assert.equal(artifacts.urls.length, 1);
  assert.equal(artifacts.urls[0].url, 'https://example.com/CaseSensitive?Token=ABC');
  assert.deepEqual(artifacts.emails, ['support@example.com']);
  assert.deepEqual(artifacts.phoneNumbers, ['+639175550182']);
  assert.equal(artifacts.credentials.otpDetected, true);
  assert.equal(input.original.includes('HXXPS'), true);
  assert.deepEqual(extractArtifacts(normalizeInput('a@example.com')).urls, []);
});

test('message type distinguishes URLs, structured emails, short texts, and unknown input', () => {
  for (const [text, expected] of [['hxxps://Example[.]com/Path', 'url'], ['Subject: invoice\nHello', 'email'], ['Lunch at noon?', 'sms'], ['A longer unstructured paragraph. '.repeat(10), 'unknown']]) {
    const input = normalizeInput(text);
    assert.equal(detectMessageType(input, extractArtifacts(input)).type, expected);
  }
});

test('all analyzers begin before the model finishes; authoritative artifacts drive inspection', async () => {
  let release;
  const events = [];
  const pending = orchestrateScan({ text: 'Go to https://example.com/path' }, {
    classify: async () => { events.push('model'); await new Promise(resolve => { release = resolve; }); return { ...model(.1), detected_urls: [{ url: 'https://ignored.invalid' }] }; },
    analyzeIndicators: async () => { events.push('indicators'); return rules(); },
    inspect: async url => { events.push(url); return { registration: { age_days: 800 }, destination: { status: 'checked', redirects: [] } }; },
  });
  assert.deepEqual(events, ['model', 'indicators', 'https://example.com/path']);
  release();
  const { report } = await pending;
  assert.equal(report.risk_score, 10);
  assert.equal(report.detected_urls[0].url, 'https://example.com/path');
  assert.equal(report.assessment.isProbability, false);
  assert.equal(report.textAnalysis.phishingProbability, .1);
});

test('model probability remains separate, rule observations do not double count, and thresholds are stable', () => {
  for (const [probability, points, classification, score] of [[.349, 0, 'Legitimate', 34.9], [.35, 0, 'Suspicious', 35], [.54, 20, 'Phishing', 74], [.95, 40, 'Phishing', 100]]) {
    const assessment = evaluateRisk({ model: model(probability), indicators: { status: 'complete', indicators: [{ severity: 'high' }] },
      urls: { status: 'complete', checks: [{ risk: { score: points } }] }, entities: { status: 'complete' } });
    assert.equal(assessment.classification, classification);
    assert.equal(assessment.overallRiskScore, score);
    assert.equal(assessment.components.indicatorPoints, 0);
  }
});

test('indicator outage is explicit while model and URL results remain usable', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      if (String(url).endsWith('/api/indicators')) throw new Error('offline');
      assert.ok(String(url).endsWith('/api/classify'));
      return { ok: true, json: async () => model(.2) };
    };
    const { report } = await orchestrateScan({ text: 'Hello' }, analyzerClient('http://localhost:8000'));
    assert.equal(report.risk_score, 20);
    assert.equal(report.indicatorAnalysis.status, 'unavailable');
    assert.equal(report.assessment.coverage.indicators, 'unavailable');
    assert.ok(report.explanation.limitations.some(value => value.includes('could not finish')));
  } finally { globalThis.fetch = original; }
});
