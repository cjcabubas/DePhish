import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true }, userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tokenHash: { type: String, required: true, select: false }, expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });
export const PasswordResetGrant = mongoose.model('PasswordResetGrant', schema);
export function createPasswordResetGrantRepository() {
  return { init: () => PasswordResetGrant.init(), put: fields => PasswordResetGrant.findOneAndUpdate({ email: fields.email }, { $set: fields }, { upsert: true, new: true }),
    find: (email, tokenHash, now) => PasswordResetGrant.findOne({ email, tokenHash, expiresAt: { $gt: now } }).select('+tokenHash'),
    consume: (id, now) => PasswordResetGrant.findOneAndDelete({ _id: id, expiresAt: { $gt: now } }) };
}
