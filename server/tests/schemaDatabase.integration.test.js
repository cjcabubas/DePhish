import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID, createHash } from "node:crypto";
import { readConfig } from "../src/config/env.js";
import { createScanRepository } from "../src/models/ScanReport.js";
import { createReportRepository } from "../src/models/CommunityReport.js";
import { createConsentRepository } from "../src/models/ScanConsent.js";
import { createLearningProgressRepository } from "../src/models/LearningProgress.js";
import { migrationPatch } from "../src/services/schemaMigrationService.js";

test(
  "minimized database documents preserve API results, consent archives, dashboards and migration races",
  { skip: process.env.DEPHISH_DATABASE_TEST !== "1" },
  async () => {
    const config = readConfig();
    const prefix = `__dephish_schema_${randomUUID().replaceAll("-", "")}`;
    const names = [
      "scans",
      "reports",
      "indicators",
      "consents",
      "terms",
      "learning",
    ].map((name) => `${prefix}_${name}`);
    try {
      await mongoose.connect(config.mongoUri, {
        dbName: config.dbName,
        serverSelectionTimeoutMS: 10000,
      });
      const scans = createScanRepository(names[0]);
      const reports = createReportRepository(names[1], names[2]);
      const consents = createConsentRepository(names[3], names[4]);
      const progress = createLearningProgressRepository(names[5]);
      await Promise.all([
        scans.init(),
        reports.init(),
        consents.init(),
        progress.init(),
      ]);
      const owner = new mongoose.Types.ObjectId();
      const fields = {
        userId: owner,
        source: "account",
        accepted: true,
        acceptedAt: new Date(),
        termsVersion: "fixture-1",
        termsEffectiveDate: "2026-10-19",
        termsText: "Synthetic consent terms",
        termsSha256: createHash("sha256")
          .update("Synthetic consent terms")
          .digest("hex"),
      };
      const [consent] = await Promise.all([
        consents.create(fields),
        consents.create(fields),
      ]);
      assert.equal(
        await mongoose.connection.collection(names[4]).countDocuments(),
        1,
      );
      const rawConsent = await mongoose.connection
        .collection(names[3])
        .findOne({ _id: consent._id });
      assert.equal(rawConsent.termsText, undefined);
      assert.equal(rawConsent.termsId, fields.termsSha256);
      assert.equal(
        (await consents.find(consent._id)).termsText,
        fields.termsText,
      );
      await assert.rejects(
        consents.create({ ...fields, termsSha256: "0".repeat(64) }),
        /hash mismatch/,
      );
      await assert.rejects(
        consents.create({ ...fields, termsVersion: "conflicting" }),
        /archive conflict/,
      );
      assert.equal(
        await mongoose.connection.collection(names[3]).countDocuments(),
        2,
      );
      const legacyConsent = await mongoose.connection
        .collection(names[3])
        .insertOne(fields);
      assert.equal(
        (await consents.find(legacyConsent.insertedId)).termsText,
        fields.termsText,
      );
      const result = {
        assessment: { classification: "Phishing", overallRiskScore: 80 },
        prediction: "Phishing",
        risk_score: 80,
        indicatorAnalysis: { indicators: [{ category: "urgency" }] },
        detected_indicators: [{ category: "urgency" }],
      };
      const saved = await scans.create({
        userId: owner,
        guestId: "guest",
        originallySubmittedAsGuest: true,
        submittedBy: "user",
        source: "account",
        consentId: consent._id,
        tosAcknowledged: true,
        title: "Synthetic",
        message: "Synthetic",
        result,
      });
      const raw = await mongoose.connection
        .collection(names[0])
        .findOne({ _id: saved._id });
      assert.equal(raw.result.prediction, undefined);
      assert.equal(raw.source, undefined);
      assert.equal(raw.submittedBy, undefined);
      assert.equal(raw.tosAcknowledged, undefined);
      assert.deepEqual(saved.result, result);
      assert.deepEqual((await scans.list(owner, 10))[0].result, result);
      const legacy = await mongoose.connection.collection(names[0]).insertOne({
        userId: owner,
        title: "Legacy",
        createdAt: new Date(),
        result: { prediction: "Legitimate", detected_indicators: [] },
      });
      assert.equal(
        (await scans.findOwned(legacy.insertedId, owner)).result.prediction,
        "Legitimate",
      );
      const stats = await scans.stats(owner);
      assert.equal(stats.total, 2);
      assert.equal(stats.phishing, 1);
      assert.equal(stats.legitimate, 1);
      assert.deepEqual(stats.indicators, [{ category: "urgency", count: 1 }]);
      const report = await reports.create({
        userId: owner,
        consentId: consent._id,
        content: { message: "Synthetic", details: "", senderEmail: "" },
        analysis: result,
        expiresAt: new Date(Date.now() + 86400000),
      });
      const rawReport = await mongoose.connection
        .collection(names[1])
        .findOne({ _id: report._id });
      assert.equal(rawReport.analysis.prediction, undefined);
      assert.deepEqual(rawReport.content, { message: "Synthetic" });
      assert.deepEqual(
        (await reports.list({ userId: owner })).reports[0].analysis,
        result,
      );
      const modules = [
        {
          moduleId: "test",
          sections: [
            {
              sectionIndex: 0,
              quizAttempts: [{ score: 80, passed: true }],
              bestScore: 80,
              passed: true,
            },
          ],
        },
      ];
      await progress.save(owner, modules);
      const rawProgress = await mongoose.connection
        .collection(names[5])
        .findOne({ userId: owner });
      assert.equal(rawProgress.modules[0].sections[0].passed, undefined);
      assert.equal(
        rawProgress.modules[0].sections[0].quizAttempts[0].passed,
        undefined,
      );
      assert.equal(
        (await progress.getByUser(owner)).modules[0].sections[0].bestScore,
        80,
      );
      const collection = mongoose.connection.collection(names[0]);
      const old = {
        userId: null,
        guestId: "race",
        source: "guest",
        result,
        title: "Race",
      };
      const inserted = await collection.insertOne(old);
      const patch = migrationPatch("scans", {
        ...old,
        _id: inserted.insertedId,
      });
      await collection.updateOne(
        { _id: inserted.insertedId },
        { $set: { userId: owner } },
      );
      assert.equal(
        (await collection.updateOne(patch.filter, patch.update)).matchedCount,
        0,
      );
      const fresh = migrationPatch(
        "scans",
        await collection.findOne({ _id: inserted.insertedId }),
      );
      assert.equal(
        (await collection.updateOne(fresh.filter, fresh.update)).modifiedCount,
        1,
      );
      assert.equal(
        migrationPatch(
          "scans",
          await collection.findOne({ _id: inserted.insertedId }),
        ),
        null,
      );
    } finally {
      if (mongoose.connection.readyState === 1)
        for (const name of names) {
          assert.ok(name.startsWith(prefix));
          await mongoose.connection
            .collection(name)
            .drop()
            .catch((error) => {
              if (error.code !== 26) throw error;
            });
        }
      await mongoose.disconnect();
    }
  },
);
