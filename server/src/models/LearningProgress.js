import mongoose from "mongoose";
import {
  readLearningModules,
  storeLearningModules,
} from "../services/learningProgressService.js";

// Tracks per-user lesson completion and quiz scores for the Learn module.
// One document per user, updated in place via upsert to keep the collection lean.

const quizAttemptSchema = new mongoose.Schema(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    attemptedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const sectionProgressSchema = new mongoose.Schema(
  {
    sectionIndex: { type: Number, required: true },
    quizAttempts: { type: [quizAttemptSchema], default: [] },
    bestScore: Number,
    passed: Boolean,
  },
  { _id: false },
);

const moduleProgressSchema = new mongoose.Schema(
  {
    moduleId: { type: String, required: true },
    completedLessons: { type: [String], default: [] }, // lesson ids
    sections: { type: [sectionProgressSchema], default: [] },
    startedAt: { type: Date, default: () => new Date() },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    modules: { type: [moduleProgressSchema], default: [] },
  },
  { timestamps: true, bufferCommands: false },
);
// userId unique:true above already creates the index — no schema.index() needed.

export function createLearningProgressRepository(
  collectionName = "learning_progress",
) {
  const LearningProgress =
    mongoose.models.LearningProgress ||
    mongoose.model("LearningProgress", schema, collectionName);
  return {
    init: () => LearningProgress.init(),

    // Return the full progress doc for a user, or null.
    getByUser: async (userId) => {
      const doc = await LearningProgress.findOne({ userId }).lean();
      return doc ? { ...doc, modules: readLearningModules(doc.modules) } : null;
    },

    // Upsert the whole modules array for a user.
    save: async (userId, modules) => {
      const doc = await LearningProgress.findOneAndUpdate(
        { userId },
        { $set: { modules: storeLearningModules(modules) } },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      ).lean();
      return { ...doc, modules: readLearningModules(doc.modules) };
    },
  };
}
