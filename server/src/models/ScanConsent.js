import mongoose from 'mongoose';

export function createConsentRepository() {
  const schema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
    source: { type: String, enum: ['account', 'guest'], required: true, immutable: true },
    accepted: { type: Boolean, required: true, enum: [true], immutable: true },
    acceptedAt: { type: Date, required: true, immutable: true },
    termsVersion: { type: String, required: true, immutable: true },
    termsEffectiveDate: { type: String, required: true, immutable: true },
    termsText: { type: String, required: true, immutable: true },
    termsSha256: { type: String, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  }, { bufferCommands: false });
  schema.index({ userId: 1, acceptedAt: -1 });
  const Consent = mongoose.models.ScanConsent || mongoose.model('ScanConsent', schema, 'scan_consents');
  return { init: () => Consent.init(), create: fields => Consent.create(fields) };
}
