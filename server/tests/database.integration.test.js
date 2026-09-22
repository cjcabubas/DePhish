import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config/env.js';
import { createIdentifierRepository } from '../src/models/FlaggedIdentifier.js';
import { createScanRepository } from '../src/models/ScanReport.js';
import { persistScan } from '../src/services/scanPersistenceService.js';
import { normalizeInput, extractArtifacts } from '../src/services/artifactService.js';
import { retainedIdentifiers, retentionPolicy } from '../src/services/retentionService.js';

// Deliberately isolated collections; never reads, updates, or deletes production records.
test('MongoDB stores minimized reports and identifiers with working expiry indexes', { skip: process.env.DEPHISH_DATABASE_TEST !== '1' }, async () => {
  const config = readConfig();
  const prefix = `__dephish_verify_${randomUUID().replaceAll('-', '')}`;
  const collectionNames = [`${prefix}_scans`, `${prefix}_identifiers`];
  try {
    await mongoose.connect(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 10000 });
    const scans = createScanRepository(collectionNames[0]);
    const identifiers = createIdentifierRepository(collectionNames[1]);
    await Promise.all([scans.init(), identifiers.init()]);
    const prepared = normalizeInput('Synthetic fixture: OTP 719281, test@example.com, 09175550182.');
    const artifacts = extractArtifacts(prepared);
    const consentId = new mongoose.Types.ObjectId();
    const result = await persistScan({ prepared, artifacts, consent: { _id: consentId }, scans, identifiers,
      pseudonymizationKey: 'isolated-test-only-key', report: { prediction: 'Suspicious', risk_score: 50, detected_indicators: [] } });
    assert.equal(result.persistence.status, 'saved');
    assert.equal(result.identifier_registry.status, 'not_applicable');
    const saved = await mongoose.models.ScanReport.findById(result.persistence.id).lean();
    assert.equal(String(saved.consentId), String(consentId));
    assert.equal(saved.result.dataRetention.reportStorage, 'redacted');
    assert.equal(saved.message.includes('719281'), false);
    assert.equal(saved.message.includes('test@example.com'), false);
    assert.ok(saved.expiresAt > new Date());
    assert.equal((await identifiers.list(10)).length, 0, 'Scanning must not publish identifiers');
    // Legacy repository contract remains supported, but is no longer called by scans.
    await identifiers.record(retainedIdentifiers(artifacts, retentionPolicy('Suspicious', false), 'isolated-test-only-key'), { risk_score: 50 });
    const records = await identifiers.list(10);
    assert.equal(records.length, 2);
    assert.ok(records.every(row => row.expiresAt > new Date() && row.value.includes('*')));
    for (const name of collectionNames) {
      const indexes = await mongoose.connection.collection(name).indexes();
      assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    }
    // Repeated observations must not extend retention indefinitely.
    const record = await mongoose.models.FlaggedIdentifier.findOne().lean();
    await identifiers.record([{ ...record, expiresAt: new Date(Date.now() + 30 * 86400000) }], { risk_score: 90 });
    const repeated = await mongoose.models.FlaggedIdentifier.findById(record._id).lean();
    assert.equal(repeated.expiresAt.getTime(), record.expiresAt.getTime());
  } finally {
    if (mongoose.connection.readyState === 1) for (const name of collectionNames) {
      assert.ok(name.startsWith(prefix));
      await mongoose.connection.collection(name).drop().catch(error => { if (error.code !== 26) throw error; });
    }
    await mongoose.disconnect();
  }
});
