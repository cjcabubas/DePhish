import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { readConfig } from "../src/config/env.js";
import { createConsentRepository } from "../src/models/ScanConsent.js";
import { migrationPatch } from "../src/services/schemaMigrationService.js";

// Read-only by default. Apply only after deploying compatible readers and taking
// a recoverable database backup. No document contents or credentials are logged.
const apply = process.argv.includes("--apply");
if (
  process.argv.slice(2).some((arg) => !["--apply", "--dry-run"].includes(arg))
)
  throw new Error(
    "Usage: node scripts/minimizeSchema.js [--dry-run | --apply]",
  );
const config = readConfig();
const counts = {};
try {
  await mongoose.connect(config.mongoUri, {
    dbName: config.dbName,
    serverSelectionTimeoutMS: 10000,
  });
  // Do not even compile models in dry-run mode: Mongoose can create collections
  // and indexes automatically when a model is compiled on a connected instance.
  const consents = apply ? createConsentRepository() : null;
  if (apply) await consents.init();
  for (const [kind, name] of Object.entries({
    scans: config.scanCollectionName,
    reports: "reports",
    learning: "learning_progress",
    otps: "emailotps",
  })) {
    const collection = mongoose.connection.collection(name);
    const totals = (counts[kind] = {
      examined: 0,
      eligible: 0,
      changed: 0,
      conflicted: 0,
    });
    for await (const row of collection.find({}).batchSize(100)) {
      totals.examined++;
      // A consent boolean is removable only with an existing acceptance event.
      const patchInput = { ...row };
      let preserveAcknowledgement = false;
      if (
        kind === "scans" &&
        row.consentId &&
        Object.hasOwn(row, "tosAcknowledged")
      ) {
        const consent = await mongoose.connection
          .collection("scan_consents")
          .findOne(
            { _id: row.consentId, accepted: true },
            { projection: { _id: 1 } },
          );
        preserveAcknowledgement = !consent;
      }
      const patch = migrationPatch(kind, patchInput);
      if (!patch) continue;
      if (preserveAcknowledgement && patch.update.$unset) {
        delete patch.update.$unset.tosAcknowledged;
        if (!Object.keys(patch.update.$unset).length)
          delete patch.update.$unset;
      }
      if (!Object.keys(patch.update).length) continue;
      totals.eligible++;
      if (apply) {
        const result = await collection.updateOne(patch.filter, patch.update);
        if (result.matchedCount) totals.changed += result.modifiedCount;
        else totals.conflicted++;
      }
    }
  }
  const totals = (counts.consents = {
    examined: 0,
    eligible: 0,
    changed: 0,
    invalid: 0,
    conflicted: 0,
  });
  const events = mongoose.connection.collection("scan_consents");
  for await (const row of events
    .find({ termsText: { $exists: true } })
    .batchSize(100)) {
    totals.examined++;
    if (
      typeof row.termsText !== "string" ||
      !row.termsVersion ||
      !row.termsEffectiveDate ||
      createHash("sha256").update(row.termsText).digest("hex") !==
        row.termsSha256
    ) {
      totals.invalid++;
      continue;
    }
    totals.eligible++;
    if (apply) {
      const terms = await consents.archiveTerms(row);
      const result = await events.updateOne(
        {
          _id: row._id,
          termsText: row.termsText,
          termsVersion: row.termsVersion,
          termsEffectiveDate: row.termsEffectiveDate,
          termsSha256: row.termsSha256,
        },
        {
          $set: { termsId: terms._id },
          $unset: {
            termsText: "",
            termsVersion: "",
            termsEffectiveDate: "",
            termsSha256: "",
          },
        },
      );
      if (result.matchedCount) totals.changed += result.modifiedCount;
      else totals.conflicted++;
    }
  }
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", counts }, null, 2),
  );
} catch {
  console.error(
    "Schema migration did not complete. Check connectivity, terms integrity and configuration; no document contents are logged. The migration can be rerun.",
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
