import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../src/config/env.js';
import { createScanRepository } from '../src/models/ScanReport.js';
import { createReportRepository } from '../src/models/CommunityReport.js';
import { createOwnershipService, ownershipFields } from '../src/services/ownershipService.js';

test('database ownership: atomic migration, claim races, late submissions, rollback and review preserve identity',
  { skip: process.env.DEPHISH_REPORT_DATABASE_TEST !== '1' }, async () => {
    const config = readConfig(), prefix = `__dephish_ownership_${randomUUID().replaceAll('-', '')}`;
    const names = ['scans', 'reports', 'indicators', 'guests'].map(name => `${prefix}_${name}`);
    try {
      await mongoose.connect(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 10000 });
      const scans = createScanRepository(names[0]), reports = createReportRepository(names[1], names[2]);
      const ownership = createOwnershipService(scans, reports, names[3]);
      await Promise.all([scans.init(), reports.init(), ownership.init()]);
      const owner = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId(), admin = new mongoose.Types.ObjectId();
      const guestId = `guest_${'a'.repeat(64)}`, consentId = new mongoose.Types.ObjectId();
      const expiresAt = new Date(Date.now() + 86400000);
      const scanFields = { ...ownershipFields(null, guestId), source: 'guest', title: 'Guest scan', message: 'Synthetic', result: { prediction: 'Phishing' }, expiresAt };
      const reportFields = { ...ownershipFields(null, guestId), consentId, content: { message: 'Synthetic' }, analysis: { prediction: 'Phishing' }, expiresAt };
      const scan = await ownership.create(scans, scanFields);
      const rows = [];
      for (const status of ['pending', 'verified', 'rejected']) rows.push(await ownership.create(reports, { ...reportFields, status }));
      const unrelated = await ownership.create(reports, { ...reportFields, guestId: `guest_${'b'.repeat(64)}` });
      const alreadyOwned = await reports.create({ ...reportFields, userId: other, submittedBy: 'user' });
      await Promise.all([ownership.claim(guestId, String(owner)), ownership.claim(guestId, String(other))]);
      const winner = String((await reports.find(rows[0]._id)).userId);
      const loser = winner === String(owner) ? String(other) : String(owner);
      assert.equal((await scans.list(winner, 50)).length, 1);
      assert.equal(String((await scans.findOwned(scan._id, winner))._id), String(scan._id));
      for (const row of rows) {
        const saved = await reports.find(row._id);
        assert.equal(String(saved.userId), winner); assert.equal(saved.guestId, guestId);
        assert.equal(saved.status, row.status); assert.equal(saved.submittedBy, 'user');
        assert.equal(saved.originallySubmittedAsGuest, true); assert.equal(saved.expiresAt.getTime(), expiresAt.getTime());
      }
      assert.equal((await reports.find(unrelated._id)).userId, null);
      assert.equal(String((await reports.find(alreadyOwned._id)).userId), String(other));
      await ownership.claim(guestId, loser);
      await ownership.claim(guestId, winner);
      assert.equal(String((await reports.find(rows[0]._id)).userId), winner);
      const late = await ownership.create(scans, scanFields);
      assert.equal(String(late.userId), winner); assert.equal(late.source, 'account');
      const reviewed = await reports.review(rows[0]._id, 0, { status: 'verified', indicators: [], note: 'Reviewed', emailReviewed: false }, admin);
      assert.equal(String(reviewed._id), String(rows[0]._id)); assert.equal(String(reviewed.userId), winner);
      const rejected = await reports.review(rows[0]._id, 1, { status: 'rejected', indicators: [], note: 'Rejected', emailReviewed: false }, admin);
      assert.equal(String(rejected.userId), winner); assert.equal(rejected.guestId, guestId);
      assert.equal(await mongoose.models.CommunityReport.countDocuments(), 5);
      // Fail the second history update: the claim and first update must roll back.
      const rollbackId = `guest_${'c'.repeat(64)}`;
      const rollbackScan = await ownership.create(scans, { ...scanFields, guestId: rollbackId });
      const failing = createOwnershipService(scans, { claimGuest: async () => { throw new Error('Synthetic migration failure'); } });
      await assert.rejects(failing.claim(rollbackId, String(owner)), /Synthetic/);
      assert.equal((await mongoose.models.ScanReport.findById(rollbackScan._id)).userId, null);
      assert.equal((await mongoose.models.GuestIdentity.findById(rollbackId)).userId, null);
      await ownership.claim(rollbackId, String(other));
      assert.ok(await scans.findOwned(rollbackScan._id, String(other)));
      // Pre-feature anonymous records have no proof of browser ownership.
      const legacy = await reports.create({ consentId, analysis: {}, expiresAt });
      await ownership.claim(guestId, winner);
      assert.equal((await reports.find(legacy._id)).userId, null);
      await assert.rejects(ownership.create(scans, { ...scanFields, guestId: null }), /Guest ownership/);
    } finally {
      if (mongoose.connection.readyState === 1) for (const name of names) {
        assert.ok(name.startsWith('__dephish_ownership_'));
        await mongoose.connection.db.collection(name).drop().catch(error => { if (error.code !== 26) throw error; });
      }
      await mongoose.disconnect();
    }
  });
