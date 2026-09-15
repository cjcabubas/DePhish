import test from 'node:test';
import assert from 'node:assert/strict';
import { withScanLoading } from '../src/services/scanLoading.js';

test('fast success fills only the remaining display time; slow success and errors have no added delay', async () => {
  let elapsed = 0, delay = 0;
  const options = { now: () => elapsed, wait: async ms => { delay = ms; } };
  assert.equal(await withScanLoading(async () => { elapsed = 200; return 'result'; }, options), 'result');
  assert.equal(delay, 1000);
  elapsed = 0; delay = 0;
  await withScanLoading(async () => { elapsed = 2000; }, options);
  assert.equal(delay, 0);
  await assert.rejects(withScanLoading(async () => { throw new Error('Too many scans'); }, options), /Too many scans/);
  assert.equal(delay, 0);
});
