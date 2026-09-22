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
    const old = renderToStaticMarkup(React.createElement(ScanResult, { result: { prediction: 'Legitimate', risk_score: 1, detected_indicators: [], detected_urls: [] } }));
    assert.match(old, /No specific warning phrases/);
    assert.equal(messageTypeLabel('url'), 'URL');
    assert.equal(messageTypeLabel('unknown'), 'Message');
  } finally { await vite.close(); }
});
