import mongoose from 'mongoose';

export function createIdentifierRepository() {
  const evidence = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    scanId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScanReport' },
    risk_score: Number, model_risk_score: Number, model_version: String,
    scoring_version: String, indicators: [String],
  }, { _id: false });
  const schema = new mongoose.Schema({
    key: { type: String, required: true },
    kind: { type: String, enum: ['url', 'email', 'phone'], required: true },
    value: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ['scanner_flagged', 'confirmed', 'dismissed'], default: 'scanner_flagged' },
    source: { type: String, default: 'phishing_scan' },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    detections: { type: Number, default: 0 },
    lastEvidence: evidence,
  }, { bufferCommands: false });
  schema.index({ key: 1 }, { unique: true });
  schema.index({ status: 1, lastSeenAt: -1 });
  const Identifier = mongoose.models.FlaggedIdentifier || mongoose.model('FlaggedIdentifier', schema, 'flagged_identifiers');
  return {
    init: () => Identifier.init(),
    async record(identifiers, evidence) {
      const now = new Date();
      // A unique index and atomic upserts keep repeated/concurrent detections in
      // one record. Subsequent scans do not override a reviewer's status.
      const writes = await Promise.allSettled(identifiers.map(async identifier => {
        const update = { $setOnInsert: { ...identifier, status: 'scanner_flagged', source: 'phishing_scan', firstSeenAt: now },
          $max: { lastSeenAt: now }, $inc: { detections: 1 }, $set: { lastEvidence: evidence } };
        try {
          await Identifier.updateOne({ key: identifier.key }, update, { upsert: true, runValidators: true, maxTimeMS: 3000 });
        } catch (error) {
          if (error.code !== 11000) throw error;
          // A concurrent upsert won the unique-key race; record this detection.
          await Identifier.updateOne({ key: identifier.key }, { $max: { lastSeenAt: now }, $inc: { detections: 1 }, $set: { lastEvidence: evidence } }, { runValidators: true, maxTimeMS: 3000 });
        }
      }));
      const failed = writes.find(write => write.status === 'rejected');
      if (failed) throw failed.reason;
    },
    list: limit => Identifier.find().sort({ lastSeenAt: -1 }).limit(limit).select('kind value status source detections firstSeenAt lastSeenAt').lean(),
  };
}
