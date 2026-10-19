import test from "node:test";
import assert from "node:assert/strict";
import {
  readAnalysis,
  storeAnalysis,
  storeOwned,
  readOwned,
  storeReport,
} from "../src/services/storageFormat.js";
import { migrationPatch } from "../src/services/schemaMigrationService.js";
import {
  readLearningModules,
  storeLearningModules,
  normalizeLearningInput,
} from "../src/services/learningProgressService.js";

const analysis = {
  assessment: {
    classification: "Phishing",
    overallRiskScore: 85,
    components: { modelScore: 40 },
  },
  textAnalysis: {
    modelPrediction: "Legitimate",
    learnedFeatures: { terms: ["urgent"] },
  },
  indicatorAnalysis: { indicators: [{ category: "urgency" }] },
  urlAnalysis: { checks: [{ url: "https://example.com" }] },
  prediction: "Phishing",
  risk_score: 85,
  model_risk_score: 40,
  model_prediction: "Legitimate",
  model_explanation: { terms: ["urgent"] },
  detected_indicators: [{ category: "urgency" }],
  link_checks: [{ url: "https://example.com" }],
  detected_urls: [{ url: "https://example.com/path" }],
};

test("canonical analysis round trips without losing model/final distinctions or unique evidence", () => {
  const stored = storeAnalysis(analysis);
  assert.equal(stored.prediction, undefined);
  assert.equal(stored.model_explanation, undefined);
  assert.equal(stored.link_checks, undefined);
  assert.ok(JSON.stringify(stored).length < JSON.stringify(analysis).length);
  assert.deepEqual(readAnalysis(stored), analysis);
  assert.deepEqual(storeAnalysis(stored), stored);
  assert.equal(analysis.prediction, "Phishing");
  const legacy = {
    prediction: "Suspicious",
    risk_score: 50,
    arbitraryEvidence: "keep",
  };
  assert.deepEqual(readAnalysis(storeAnalysis(legacy)), legacy);
  const conflicting = { ...analysis, prediction: "Suspicious" };
  assert.deepEqual(readAnalysis(storeAnalysis(conflicting)), conflicting);
});

test("ownership storage preserves origin and consent evidence with compatible API labels", () => {
  const stored = storeOwned({
    userId: "owner",
    guestId: "guest",
    originallySubmittedAsGuest: true,
    submittedBy: "user",
    source: "account",
    consentId: "consent",
    tosAcknowledged: true,
    expiresAt: null,
  });
  assert.equal(stored.source, undefined);
  assert.equal(stored.submittedBy, undefined);
  assert.equal(stored.tosAcknowledged, undefined);
  assert.equal(stored.originallySubmittedAsGuest, true);
  assert.equal(readOwned(stored, "result").source, "account");
  assert.equal(
    readOwned({ userId: null, guestId: "guest" }, "analysis").submittedBy,
    "guest",
  );
  assert.equal(storeOwned({ tosAcknowledged: true }).tosAcknowledged, true);
  assert.equal(readOwned(null, "result"), null);
});

test("report minimization preserves designated contacts and drops only empty content", () => {
  const stored = storeReport({
    analysis,
    content: {
      message: "hello",
      phone: "+639175550000",
      senderEmail: "",
      details: "",
    },
  });
  assert.deepEqual(stored.content, {
    message: "hello",
    phone: "+639175550000",
  });
  assert.deepEqual(readOwned(stored, "analysis").analysis, analysis);
});

test("learning summaries derive from attempts and summary-only history survives migration", () => {
  const modules = [
    {
      moduleId: "test",
      completedAt: "2026-10-19T00:00:00Z",
      sections: [
        {
          sectionIndex: 0,
          bestScore: 100,
          passed: true,
          quizAttempts: [{ score: 50, passed: true }],
        },
      ],
    },
  ];
  const normalized = normalizeLearningInput(modules);
  assert.equal(normalized[0].sections[0].bestScore, 50);
  assert.equal(normalized[0].sections[0].passed, false);
  assert.equal(normalized[0].sections[0].quizAttempts[0].passed, false);
  const stored = storeLearningModules(normalized);
  assert.equal(stored[0].sections[0].bestScore, undefined);
  assert.equal(stored[0].sections[0].quizAttempts[0].passed, undefined);
  assert.deepEqual(readLearningModules(stored), normalized);
  assert.equal(stored[0].completedAt, modules[0].completedAt);
  const legacy = [
    {
      sections: [
        { sectionIndex: 0, bestScore: 90, passed: true, quizAttempts: [] },
      ],
    },
  ];
  assert.deepEqual(readLearningModules(storeLearningModules(legacy)), legacy);
});

test("migration is idempotent and guards against concurrent review or ownership updates", () => {
  const row = {
    _id: "test",
    userId: null,
    source: "guest",
    submittedBy: "guest",
    result: analysis,
    expiresAt: new Date("2027-01-01"),
  };
  const patch = migrationPatch("scans", row);
  assert.deepEqual(patch.filter.userId, { $eq: null });
  assert.deepEqual(patch.filter.result, { $eq: analysis });
  assert.equal(patch.update.$set.originallySubmittedAsGuest, true);
  const migrated = { ...row, ...patch.update.$set };
  for (const key of Object.keys(patch.update.$unset)) delete migrated[key];
  assert.equal(migrationPatch("scans", migrated), null);
  assert.equal(migrated.expiresAt, row.expiresAt);
  const otp = migrationPatch("otps", {
    _id: "otp",
    name: "Name",
    action: true,
    purpose: "mfa_enable",
    attempts: 3,
  });
  assert.deepEqual(otp.update, { $unset: { name: "", action: "" } });
});
