import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readConfig } from "../src/config/env.js";

test(
  "migration CLI is read-only by default, preserves incomplete consent, and is repeatable",
  { skip: process.env.DEPHISH_DATABASE_TEST !== "1" },
  async () => {
    const config = readConfig();
    // Atlas limits database names more strictly than a local MongoDB server.
    const database = `__dephish_migration_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    try {
      await mongoose.connect(config.mongoUri, {
        dbName: database,
        serverSelectionTimeoutMS: 10000,
      });
      const db = mongoose.connection;
      const consentId = new mongoose.Types.ObjectId();
      const termsText = "Synthetic migration terms";
      const termsSha256 = createHash("sha256").update(termsText).digest("hex");
      await db.collection("scan_consents").insertMany([
        {
          _id: consentId,
          accepted: true,
          acceptedAt: new Date(),
          source: "guest",
          termsText,
          termsSha256,
          termsVersion: "1",
          termsEffectiveDate: "2026-10-19",
        },
        { accepted: true, termsText: "Incomplete legacy evidence" },
      ]);
      const scans = db.collection("scan_reports");
      await scans.insertMany([
        {
          title: "Valid",
          userId: null,
          source: "guest",
          submittedBy: "guest",
          consentId,
          tosAcknowledged: true,
          result: { risk_score: 80, assessment: { overallRiskScore: 80 } },
        },
        {
          title: "Orphan",
          consentId: new mongoose.Types.ObjectId(),
          tosAcknowledged: true,
          result: { prediction: "Legacy" },
        },
      ]);
      const run = async (...args) => {
        const { stdout } = await promisify(execFile)(
          process.execPath,
          [
            fileURLToPath(
              new URL("../scripts/minimizeSchema.js", import.meta.url),
            ),
            ...args,
          ],
          {
            windowsHide: true,
            env: {
              ...process.env,
              MONGODB_URI: config.mongoUri,
              DB_NAME: database,
              COLLECTION_NAME: "scan_reports",
            },
          },
        );
        return JSON.parse(stdout);
      };
      const dry = await run();
      assert.equal(dry.mode, "dry-run");
      assert.equal(dry.counts.scans.changed, 0);
      assert.equal(dry.counts.consents.invalid, 1);
      assert.equal((await scans.findOne({ title: "Valid" })).source, "guest");
      assert.equal(await db.collection("consent_terms").countDocuments(), 0);
      assert.equal(
        (await db.db.listCollections({ name: "consent_terms" }).toArray())
          .length,
        0,
      );
      const applied = await run("--apply");
      assert.equal(applied.counts.scans.changed, 1);
      assert.equal(applied.counts.consents.changed, 1);
      const valid = await scans.findOne({ title: "Valid" });
      assert.equal(valid.source, undefined);
      assert.equal(valid.originallySubmittedAsGuest, true);
      assert.equal(valid.tosAcknowledged, undefined);
      assert.equal(valid.result.risk_score, undefined);
      assert.equal(
        (await scans.findOne({ title: "Orphan" })).tosAcknowledged,
        true,
      );
      const consent = await db
        .collection("scan_consents")
        .findOne({ _id: consentId });
      assert.equal(consent.termsId, termsSha256);
      assert.equal(consent.termsText, undefined);
      assert.equal(
        (await db.collection("consent_terms").findOne({ _id: termsSha256 }))
          .text,
        termsText,
      );
      const repeated = await run("--apply");
      assert.equal(repeated.counts.scans.changed, 0);
      assert.equal(repeated.counts.consents.changed, 0);
      assert.equal(repeated.counts.consents.invalid, 1);
    } finally {
      try {
        if (mongoose.connection.readyState === 1) {
          assert.equal(mongoose.connection.name, database);
          assert.ok(database.startsWith("__dephish_migration_"));
          await mongoose.connection.dropDatabase();
        }
      } finally {
        await mongoose.disconnect();
      }
    }
  },
);
