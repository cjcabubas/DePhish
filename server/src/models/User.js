import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, unique: true },
  passwordHash: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: 0, select: false },
  emailVerified: { type: Boolean, default: true },
  mfaEnabled: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true });
export const User = mongoose.model('User', schema);
export const userRepository = {
  create: fields => User.create(fields),
  findByEmail: email => User.findOne({ email }).select('+passwordHash +sessionVersion'),
  findByEmailAddress: email => User.findOne({ email }),
  findById: id => User.findById(id).select('+sessionVersion'),
  updatePassword: (id, passwordHash) => User.updateOne({ _id: id }, { $set: { passwordHash }, $inc: { sessionVersion: 1 } }),
  setMfa: async (id, enabled) => User.findByIdAndUpdate(id, { $set: { mfaEnabled: enabled }, $inc: { sessionVersion: 1 } }, { new: true }).select('+sessionVersion'),
};
