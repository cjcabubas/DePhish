import mongoose from "mongoose";
import { createHash } from "node:crypto";

export function createConsentRepository(
  collectionName = "scan_consents",
  termsCollection = "consent_terms",
) {
  const termsSchema = new mongoose.Schema(
    {
      _id: String,
      version: { type: String, required: true, immutable: true },
      effectiveDate: { type: String, required: true, immutable: true },
      text: { type: String, required: true, immutable: true },
    },
    { bufferCommands: false, versionKey: false },
  );
  const schema = new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        immutable: true,
      },
      guestId: { type: String, default: null, immutable: true },
      source: {
        type: String,
        enum: ["account", "guest"],
        required: true,
        immutable: true,
      },
      accepted: {
        type: Boolean,
        required: true,
        enum: [true],
        immutable: true,
      },
      acceptedAt: { type: Date, required: true, immutable: true },
      termsId: { type: String, immutable: true, match: /^[a-f0-9]{64}$/ },
      // Legacy fields remain readable while existing events are migrated.
      termsVersion: { type: String, immutable: true },
      termsEffectiveDate: { type: String, immutable: true },
      termsText: { type: String, immutable: true },
      termsSha256: {
        type: String,
        match: /^[a-f0-9]{64}$/,
        immutable: true,
      },
    },
    { bufferCommands: false },
  );
  schema.pre("validate", function () {
    if (
      !this.termsId &&
      !(
        this.termsVersion &&
        this.termsEffectiveDate &&
        this.termsText &&
        this.termsSha256
      )
    )
      this.invalidate(
        "termsId",
        "An archived terms reference or complete legacy terms are required.",
      );
  });
  schema.index({ userId: 1, acceptedAt: -1 });
  const Consent =
    mongoose.models.ScanConsent ||
    mongoose.model("ScanConsent", schema, collectionName);
  const Terms =
    mongoose.models.ConsentTerms ||
    mongoose.model("ConsentTerms", termsSchema, termsCollection);
  async function archiveTerms(fields) {
    const hash = createHash("sha256").update(fields.termsText).digest("hex");
    if (hash !== fields.termsSha256)
      throw new Error("Consent terms hash mismatch");
    try {
      await Terms.updateOne(
        { _id: hash },
        {
          $setOnInsert: {
            version: fields.termsVersion,
            effectiveDate: fields.termsEffectiveDate,
            text: fields.termsText,
          },
        },
        { upsert: true, runValidators: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const terms = await Terms.findById(hash).lean();
    if (
      !terms ||
      terms.text !== fields.termsText ||
      terms.version !== fields.termsVersion ||
      terms.effectiveDate !== fields.termsEffectiveDate
    )
      throw new Error("Consent terms archive conflict");
    return terms;
  }
  return {
    init: async () => {
      await Terms.init();
      await Consent.init();
    },
    archiveTerms,
    async create(fields) {
      // Archive first: an unused terms document is safe, a dangling event is not.
      const terms = await archiveTerms(fields);
      const event = await Consent.create({
        userId: fields.userId,
        guestId: fields.guestId,
        source: fields.source,
        accepted: fields.accepted,
        acceptedAt: fields.acceptedAt,
        termsId: terms._id,
      });
      return { ...event.toObject(), termsVersion: terms.version };
    },
    async find(id) {
      const event = await Consent.findById(id).lean();
      if (!event || !event.termsId) return event;
      const terms = await Terms.findById(event.termsId).lean();
      if (!terms) throw new Error("Consent terms archive missing");
      return {
        ...event,
        termsVersion: terms.version,
        termsEffectiveDate: terms.effectiveDate,
        termsText: terms.text,
        termsSha256: terms._id,
      };
    },
  };
}
