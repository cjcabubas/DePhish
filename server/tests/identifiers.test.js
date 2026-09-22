import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createIdentifierRepository } from '../src/models/FlaggedIdentifier.js';
test('repository uses unique atomic upserts and retains reviewed status on repeat detection', async () => {
  const repository = createIdentifierRepository();
  const Model = mongoose.models.FlaggedIdentifier;
  assert.ok(Model.schema.indexes().some(([keys, options]) => keys.key === 1 && options.unique));
  const original = Model.updateOne;
  const calls = [];
  Model.updateOne = async (filter, update, options) => { calls.push({ filter, update, options }); if (calls.length === 1) throw Object.assign(new Error(), { code: 11000 }); };
  try {
    await repository.record([{ key: 'unique-key', kind: 'email', value: 's***@example.com', expiresAt: new Date(Date.now()+86400000), retentionVersion: '1.0.0-minimized-artifacts' }], { risk_score: 91 });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.upsert, true);
    assert.equal(calls[0].update.$setOnInsert.status, 'scanner_flagged');
    assert.equal(calls[1].update.$inc.detections, 1);
    assert.equal('status' in calls[1].update.$set, false);
  } finally { Model.updateOne = original; }
});
