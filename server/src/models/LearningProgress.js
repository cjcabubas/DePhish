import mongoose from 'mongoose';

// Tracks per-user lesson completion and quiz scores for the Learn module.
// One document per user, updated in place via upsert to keep the collection lean.

const quizAttemptSchema = new mongoose.Schema({
  score: { type: Number, required: true, min: 0, max: 100 },
  passed: { type: Boolean, required: true },
  attemptedAt: { type: Date, default: () => new Date() },
}, { _id: false });

const sectionProgressSchema = new mongoose.Schema({
  sectionIndex: { type: Number, required: true },
  quizAttempts: { type: [quizAttemptSchema], default: [] },
  bestScore: { type: Number, default: null },
  passed: { type: Boolean, default: false },
}, { _id: false });

const moduleProgressSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  completedLessons: { type: [String], default: [] },   // lesson ids
  sections: { type: [sectionProgressSchema], default: [] },
  startedAt: { type: Date, default: () => new Date() },
  completedAt: { type: Date, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  modules: { type: [moduleProgressSchema], default: [] },
}, { timestamps: true, bufferCommands: false });

schema.index({ userId: 1 });

const LearningProgress = mongoose.models.LearningProgress
  || mongoose.model('LearningProgress', schema, 'learning_progress');

export function createLearningProgressRepository() {
  return {
    init: () => LearningProgress.init(),

    // Return the full progress doc for a user, or null.
    getByUser: userId =>
      LearningProgress.findOne({ userId }).lean(),

    // Upsert the whole modules array for a user.
    save: (userId, modules) =>
      LearningProgress.findOneAndUpdate(
        { userId },
        { $set: { modules } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean(),
  };
}
