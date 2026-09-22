import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config/env.js';
import { createReportRepository } from '../src/models/CommunityReport.js';

test('report transactions publish, retract, deduplicate, reject stale reviews and roll back failures', { skip: process.env.DEPHISH_REPORT_DATABASE_TEST !== '1' }, async () => {
  const config = readConfig(), prefix = `__dephish_reports_${randomUUID().replaceAll('-', '')}`;
  const names = [`${prefix}_reports`, `${prefix}_indicators`];
  try {
    await mongoose.connect(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 10000 });
    const reports = createReportRepository(...names);
    await reports.init();
    const admin = new mongoose.Types.ObjectId(), consentId = new mongoose.Types.ObjectId();
    const candidate = { id: 'synthetic-domain', kind: 'domain', value: 'fixture.example.com', source: 'test fixture' };
    const create = () => reports.create({ consentId, content: { message: 'Synthetic report' }, analysis: { risk_score: 80 },
      candidates: [candidate], expiresAt: new Date(Date.now() + 86400000) });
    const first = await create(), second = await create();
    assert.equal((await reports.threats()).total, 0);
    const verified = { status: 'verified', indicators: [candidate], note: 'Synthetic verification', emailReviewed: false };
    await reports.review(first._id, 0, verified, admin);
    await reports.review(second._id, 0, verified, admin);
    assert.equal((await reports.threats()).total, 1);
    assert.equal((await reports.threats()).indicators[0].reportIds.length, 2);
    assert.equal(await reports.review(first._id, 0, { ...verified, status: 'rejected', indicators: [] }, admin), null);
    await reports.review(first._id, 1, { ...verified, status: 'rejected', indicators: [] }, admin);
    assert.equal((await reports.threats()).indicators[0].reportIds.length, 1);
    await reports.review(second._id, 1, { ...verified, status: 'pending', indicators: [] }, admin);
    assert.equal((await reports.threats()).total, 0);
    // Force a threat write failure after the report update. The transaction must roll back both.
    await assert.rejects(reports.review(second._id, 2, { ...verified, indicators: [{ ...candidate, kind: 'credential' }] }, admin));
    const unchanged = await reports.find(second._id);
    assert.equal(unchanged.status, 'pending'); assert.equal(unchanged.revision, 2);
    assert.equal((await reports.threats()).total, 0);
    assert.deepEqual(unchanged.reviewLog.map(entry => entry.status), ['verified', 'pending']);
    const race = await Promise.all([reports.review(second._id, 2, verified, admin),
      reports.review(second._id, 2, { ...verified, status: 'rejected', indicators: [] }, admin)]);
    assert.equal(race.filter(Boolean).length, 1);
    const final = await reports.find(second._id);
    assert.equal((await reports.threats()).total, final.status === 'verified' ? 1 : 0);
    await mongoose.models.CommunityReport.updateOne({ _id: second._id }, { $set: { expiresAt: new Date(0) } });
    assert.equal(await reports.find(second._id), null);
    assert.equal((await reports.threats()).total, 0);
    for (const name of names) {
      const indexes = await mongoose.connection.collection(name).indexes();
      assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
    }
  } finally {
    if (mongoose.connection.readyState === 1) for (const name of names) {
      assert.ok(name.startsWith(prefix));
      await mongoose.connection.collection(name).drop().catch(error => { if (error.code !== 26) throw error; });
    }
    await mongoose.disconnect();
  }
});
