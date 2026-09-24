import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { messageTypeLabel } from '../src/services/api.js';

test('results distinguish probability from policy points and report unavailable analyzers', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
  try {
    const { ScanResult } = await vite.ssrLoadModule('/src/components/ScanResult.jsx');
    const result = { prediction: 'Suspicious', risk_score: 60, risk_level: 'Medium Risk', detected_indicators: [], detected_urls: [],
      assessment: { components: { modelScore: 20, urlPoints: 40 }, policyVersion: '4.0', note: 'Not a probability' },
      textAnalysis: { phishingProbability: .2, modelVersion: 'test' },
      indicatorAnalysis: { status: 'unavailable', reason: 'Indicator analysis could not finish.' },
      urlAnalysis: { checked: 1, status: 'partial' }, entityAnalysis: { emailsDetected: 1, phonesDetected: 0 },
      messageType: { type: 'url', basis: 'single_url' }, explanation: {} };
    const html = renderToStaticMarkup(React.createElement(ScanResult, { result }));
    assert.match(html, /20\.0%/);
    assert.match(html, /\+40/);
    assert.match(html, /not a percentage chance/);
    assert.match(html, /Indicator analysis could not finish/);
    assert.doesNotMatch(html, /No specific warning phrases/);
    const detailed = renderToStaticMarkup(React.createElement(ScanResult, { result: { ...result,
      model_explanation: { available: true, toward_phishing: [{ term: 'verify now' }], toward_legitimate: [{ term: 'login' }] },
      detected_urls: [{ url: 'https://portal.example.org', hostname: 'portal.example.org' }],
      link_checks: [{ url: 'https://portal.example.org', hostname: 'portal.example.org', domain: 'example.org',
        risk: { score: 40, factors: [{ code: 'test', explanation: 'Example link evidence', points: 40 }] },
        registration: { age_days: 1200, registrar: 'Example registrar' },
        destination: { status: 'incomplete', reason: 'DNS lookup temporarily failed.', failure_code: 'EAI_AGAIN', redirects: [] },
        limitations: 'Domain age and a valid TLS certificate do not establish safety.' }] } }));
    assert.match(detailed, /<details class="analysisDetails modelDetails"><summary>/);
    assert.match(detailed, /Text\/model score<\/dt><dd>20/);
    assert.match(detailed, /Final risk score<\/dt><dd><strong>60 \/ 100/);
    assert.match(detailed, /Wording that decreased the model&#x27;s phishing score/);
    assert.match(detailed, /login/);
    assert.doesNotMatch(detailed, /Wording associated with ordinary/);
    assert.match(detailed, /Hostname: portal.example.org/);
    assert.match(detailed, /Registrable domain<\/dt><dd><strong>example.org/);
    assert.match(detailed, /DNS \/ reachability/);
    assert.equal(detailed.split('Example link evidence').length - 1, 1);
    assert.ok(detailed.indexOf('Connection/check status') < detailed.indexOf('Domain Information'));
    assert.match(detailed, /do not establish safety/);
    const old = renderToStaticMarkup(React.createElement(ScanResult, { result: { prediction: 'Legitimate', risk_score: 1, detected_indicators: [], detected_urls: [] } }));
    assert.match(old, /No specific warning phrases/);
    assert.equal(messageTypeLabel('url'), 'URL');
    assert.equal(messageTypeLabel('unknown'), 'Message');
  } finally { await vite.close(); }
});
