import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rateLimits.js';

// Allowed module IDs and valid lesson-id patterns are validated loosely by
// checking against what the client sends; the DB stores whatever the client
// provides but the route guards ensure only authenticated users can write.

export function learnRoutes({ users, progress }) {
  const router = Router();

  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth(users));
  router.use(apiRateLimit({ limit: 60 }));

  // GET /api/learn/progress  — fetch the user's full progress doc
  router.get('/progress', async (req, res) => {
    if (!progress) return res.status(503).json({ message: 'Progress storage unavailable.' });
    try {
      const doc = await progress.getByUser(req.user._id);
      res.json({ modules: doc?.modules ?? [] });
    } catch {
      res.status(503).json({ message: 'Could not load progress. Please try again.' });
    }
  });

  // POST /api/learn/progress  — save the user's full progress doc
  router.post('/progress', async (req, res) => {
    if (!progress) return res.status(503).json({ message: 'Progress storage unavailable.' });
    const { modules } = req.body;
    if (!Array.isArray(modules)) return res.status(400).json({ message: 'modules must be an array.' });
    // Basic shape validation — reject obviously wrong payloads without being
    // overly strict (the client is the source of truth for structure).
    for (const mod of modules) {
      if (typeof mod.moduleId !== 'string' || mod.moduleId.length > 64) {
        return res.status(400).json({ message: 'Invalid module entry.' });
      }
      if (!Array.isArray(mod.completedLessons) || !Array.isArray(mod.sections)) {
        return res.status(400).json({ message: 'Invalid module entry.' });
      }
    }
    try {
      const doc = await progress.save(req.user._id, modules);
      res.json({ modules: doc.modules });
    } catch {
      res.status(503).json({ message: 'Could not save progress. Please try again.' });
    }
  });

  return router;
}
