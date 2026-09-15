import test from 'node:test';
import assert from 'node:assert/strict';
import { linkCheckSummary } from '../src/services/linkWording.js';

test('zero points distinguishes completed checks from unavailable evidence', () => {
  const complete = { risk: { score: 0 }, registration: { age_days: 1000 }, destination: { status: 'checked' } };
  assert.match(linkCheckSummary(complete), /no extra scoring warnings/);
  assert.match(linkCheckSummary({ ...complete, registration: { status: 'available', age_days: null } }), /incomplete/);
  assert.match(linkCheckSummary({ ...complete, destination: { status: 'incomplete' } }), /incomplete/);
  assert.match(linkCheckSummary(undefined), /not inspected/);
  assert.match(linkCheckSummary({ ...complete, risk: { score: 5 } }), /added 5 risk points/);
  assert.match(linkCheckSummary({ ...complete, destination: { status: 'incomplete', reason: 'The website limited inspection requests.' } }), /website limited inspection requests/);
});
