import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { apiRateLimit } from "../middleware/rateLimits.js";
import {
  validLearningProgress,
  normalizeLearningInput,
} from "../services/learningProgressService.js";

// Progress is self-reported by the client; validate its structure before storage.

export function learnRoutes({ users, progress }) {
  const router = Router();

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(requireAuth(users));
  router.use(apiRateLimit({ limit: 60 }));

  // GET /api/learn/progress  — fetch the user's full progress doc
  router.get("/progress", async (req, res) => {
    if (!progress)
      return res.status(503).json({ message: "Progress storage unavailable." });
    try {
      const doc = await progress.getByUser(req.user._id);
      res.json({ modules: doc?.modules ?? [] });
    } catch {
      res
        .status(503)
        .json({ message: "Could not load progress. Please try again." });
    }
  });

  // POST /api/learn/progress  — save the user's full progress doc
  router.post("/progress", async (req, res) => {
    if (!progress)
      return res.status(503).json({ message: "Progress storage unavailable." });
    const modules = req.body?.modules;
    if (!validLearningProgress(modules))
      return res.status(400).json({ message: "Invalid learning progress." });
    try {
      const doc = await progress.save(
        req.user._id,
        normalizeLearningInput(modules),
      );
      res.json({ modules: doc.modules });
    } catch {
      res
        .status(503)
        .json({ message: "Could not save progress. Please try again." });
    }
  });

  return router;
}
