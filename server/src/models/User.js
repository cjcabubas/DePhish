import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true });
export const User = mongoose.model('User', schema);
export const userRepository = {
  create: fields => User.create(fields),
  findByEmail: email => User.findOne({ email }).select('+passwordHash'),
  findById: id => User.findById(id),
};
