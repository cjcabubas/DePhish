import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ['registration', 'forgot_password', 'mfa_login', 'mfa_enable'], required: true },
  codeHash: { type: String, select: false },
  challengeHash: { type: String, select: false },
  userId: { type: mongoose.Schema.Types.ObjectId },
  name: String,
  action: Boolean,
  codeExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  lastSentAt: { type: Date, required: true },
  windowStartedAt: { type: Date, required: true },
  requestCount: { type: Number, default: 1 },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ email: 1, purpose: 1 }, { unique: true });
export const EmailOtp = mongoose.model('EmailOtp', schema);

export function createEmailOtpRepository() {
  return {
    init: () => EmailOtp.init(),
    get: (email, purpose) => EmailOtp.findOne({ email, purpose }).select('+codeHash +challengeHash'),
    async put(email, purpose, fields) {
      const sentAt = fields.lastSentAt, cooldownBefore = new Date(sentAt.getTime() - 60_000), windowBefore = new Date(sentAt.getTime() - 60 * 60_000);
      const filter = { email, purpose, lastSentAt: { $lte: cooldownBefore }, $or: [{ windowStartedAt: { $lte: windowBefore } }, { requestCount: { $lt: 5 } }] };
      const updated = await EmailOtp.findOneAndUpdate(filter, { $set: fields }, { new: true });
      if (updated) return updated;
      try { return await EmailOtp.create(fields); } catch (error) { if (error.code === 11000) return null; throw error; }
    },
    remove: (email, purpose) => EmailOtp.updateOne({ email, purpose }, { $unset: { codeHash: 1, challengeHash: 1 }, $set: { codeExpiresAt: new Date(0) } }),
    consume: (id, now, expectedHash) => EmailOtp.findOneAndUpdate({ _id: id, codeExpiresAt: { $gt: now }, codeHash: expectedHash }, { $unset: { codeHash: 1, challengeHash: 1 }, $set: { codeExpiresAt: now } }, { new: true }),
    incrementAttempts: id => EmailOtp.updateOne({ _id: id, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }),
  };
}
